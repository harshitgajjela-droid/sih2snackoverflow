#!/usr/bin/env python3
"""
AI Clustering runner for National Unified Material Master System.

Pipeline:
  1. NLP normalization
  2. Sentence-Transformers batch encoding
  3. Vectorized cosine similarity matrix
  4. RapidFuzz composite scoring
  5. Category-aware greedy clustering (hard pre-filter rules)
  6. Post-process: ONE MEMBER PER CPSE per cluster (best match kept)
  7. Post-process: Series homogeneity — eject any bearing whose series ≠ anchor
  8. Write to DB

Run after dataset_generator.py:
    python cluster.py
"""

import re
import time
import numpy as np
from collections import defaultdict
from matching_engine import MaterialMatchingEngine

DB_NAME = 'materials.sqlite'

# ── Bearing series regex ─────────────────────────────────────────────────────
# Matches designations like 6205, 6208, 6306, NU206, NJ307, HK2012, NA4904
BEARING_SERIES_RE = re.compile(
    r'\b(6[0-3]\d{2}|7[0-3]\d{2}|N[UJ]\d{3,}|HK\d{4}|NA\d{4})\b',
    re.IGNORECASE
)

def bearing_series(description: str) -> str | None:
    m = BEARING_SERIES_RE.search(description)
    return m.group(1).upper() if m else None


# ── Size / pressure extractors ───────────────────────────────────────────────
SIZE_RE  = re.compile(r'(\d+(?:\.\d+)?)\s*(?:inch|in\b|"|\')', re.IGNORECASE)
PRESS_RE = re.compile(r'(\d+)\s*(?:#|lb\b|lbs\b|class\b|rating\b)', re.IGNORECASE)

def pipe_size(description: str) -> float | None:
    m = SIZE_RE.search(description)
    return float(m.group(1)) if m else None


def get_category(material: dict) -> str:
    return (material.get('category') or 'Unknown').strip()


# ── Hard pre-filter ──────────────────────────────────────────────────────────
def can_cluster(m1: dict, m2: dict) -> bool:
    """
    Returns False to hard-block two items from clustering regardless of AI score.
    Checked BEFORE computing fuzzy/cosine — keeps the inner loop fast.
    """
    c1, c2 = get_category(m1), get_category(m2)

    # Rule 1: different categories never cluster
    if c1 != c2:
        return False

    # Rule 2: bearings must share the EXACT same series number
    if c1 == 'Bearing':
        s1, s2 = bearing_series(m1['description']), bearing_series(m2['description'])
        if s1 and s2 and s1 != s2:
            return False   # 6207 ≠ 6208 ≠ 6305 — absolute block

    # Rule 3: pipes/valves/flanges must share the same nominal size (±10%)
    if c1 in ('Pipe', 'Valve', 'Flange', 'Gasket'):
        sz1, sz2 = pipe_size(m1['description']), pipe_size(m2['description'])
        if sz1 and sz2:
            if abs(sz1 - sz2) > 0.1 * max(sz1, sz2):
                return False

    return True


# ── Post-processing ──────────────────────────────────────────────────────────

def one_per_cpse(cluster: list, anchor_norm: str, normalized: list,
                 idx_map: dict, fuzz_mod) -> tuple[list, list]:
    """
    For each CPSE that has multiple members in this cluster, keep only the
    member whose normalized description has the highest fuzzy similarity to
    the anchor (first item).  The rest are returned as ejected singletons.
    """
    by_cpse: dict[str, list] = defaultdict(list)
    for m in cluster:
        by_cpse[m['cpse']].append(m)

    kept, ejected = [], []
    for cpse, members in by_cpse.items():
        if len(members) == 1:
            kept.append(members[0])
        else:
            # score each against anchor
            scored = sorted(
                members,
                key=lambda m: fuzz_mod.ratio(anchor_norm, normalized[idx_map[m['id']]]),
                reverse=True
            )
            kept.append(scored[0])
            ejected.extend(scored[1:])
    return kept, ejected


def homogeneous_series(cluster: list) -> tuple[list, list]:
    """
    For bearing clusters: all members must share the same series as the
    anchor (first item).  Members with a different series are ejected.
    Also ejects members where series cannot be detected (None) if anchor has a series.
    """
    if not cluster or get_category(cluster[0]) != 'Bearing':
        return cluster, []

    anchor_series = bearing_series(cluster[0]['description'])
    if not anchor_series:
        # If anchor has no detectable series, keep all members as-is
        return cluster, []

    kept, ejected = [], []
    for m in cluster:
        ms = bearing_series(m['description'])
        # Keep only if series matches anchor exactly
        if ms == anchor_series:
            kept.append(m)
        else:
            # Eject if different series OR no series detected
            ejected.append(m)
    return kept, ejected


# ── Main ─────────────────────────────────────────────────────────────────────

def run():
    print("=" * 60)
    print("  National Unified Material Master — AI Clustering")
    print("=" * 60)

    engine = MaterialMatchingEngine(db_path=DB_NAME)

    # Step 1: load
    materials = engine.get_all_materials()
    n = len(materials)
    print(f"\n[1/6] Loaded {n} materials.")
    if n == 0:
        print("Run dataset_generator.py first."); return

    # Step 2: NLP normalise
    print(f"[2/6] NLP normalisation...")
    t0 = time.time()
    normalized = [engine.normalize_text(m['description']) for m in materials]
    # Build id → index map for fast lookup in post-processing
    idx_map = {m['id']: i for i, m in enumerate(materials)}
    print(f"      {time.time()-t0:.1f}s")

    # Step 3: Sentence-Transformer encoding
    print(f"[3/6] Sentence-Transformer encoding (batch=64)...")
    t0 = time.time()
    embeddings = engine.model.encode(
        normalized, batch_size=64, show_progress_bar=True, convert_to_numpy=True
    )
    print(f"      {time.time()-t0:.1f}s  shape={embeddings.shape}")

    # Step 4: Cosine matrix
    print(f"[4/6] Cosine similarity matrix ({n}×{n})...")
    t0 = time.time()
    from sklearn.metrics.pairwise import cosine_similarity
    cosine_matrix = cosine_similarity(embeddings).astype(np.float32)
    print(f"      {time.time()-t0:.1f}s")

    # Step 5: Greedy clustering with hard rules
    THRESHOLD = 0.82
    print(f"[5/6] Greedy clustering (threshold={THRESHOLD}, hard rules active)...")
    t0 = time.time()
    from rapidfuzz import fuzz

    visited = [False] * n
    raw_clusters: list[list[dict]] = []
    blocked = 0

    for i in range(n):
        if visited[i]:
            continue
        cluster = [materials[i]]
        visited[i] = True
        for j in range(n):
            if visited[j]:
                continue
            if not can_cluster(materials[i], materials[j]):
                blocked += 1
                continue
            score = (0.6 * float(cosine_matrix[i][j]) +
                     0.4 * fuzz.ratio(normalized[i], normalized[j]) / 100.0)
            if score >= THRESHOLD:
                cluster.append(materials[j])
                visited[j] = True
        raw_clusters.append(cluster)

    print(f"      {time.time()-t0:.1f}s  raw clusters={len(raw_clusters)}  blocked_pairs={blocked}")

    # Step 6: Post-processing
    print(f"[6/6] Post-processing: one-per-CPSE + series homogeneity...")
    final_clusters: list[list[dict]] = []
    all_ejected:    list[dict]       = []

    for cluster in raw_clusters:
        if len(cluster) == 1:
            final_clusters.append(cluster)
            continue

        anchor_norm = normalized[idx_map[cluster[0]['id']]]

        # 6a: series homogeneity for bearings — eject wrong-series members first
        cluster, ejected_series = homogeneous_series(cluster)
        all_ejected.extend(ejected_series)

        # 6b: one member per CPSE — keep best match, eject rest
        cluster, ejected_cpse = one_per_cpse(cluster, anchor_norm, normalized, idx_map, fuzz)
        all_ejected.extend(ejected_cpse)

        if cluster:
            final_clusters.append(cluster)

    # Ejected items become singleton clusters
    for m in all_ejected:
        final_clusters.append([m])

    # ── Stats ─────────────────────────────────────────────────────
    multi_cpse = [c for c in final_clusters if len({m['cpse'] for m in c}) >= 2]
    multi_same = [c for c in final_clusters if len(c) > 1 and len({m['cpse'] for m in c}) < 2]
    singletons = [c for c in final_clusters if len(c) == 1]
    ejected_total = len(all_ejected)

    print(f"\n  Results after post-processing:")
    print(f"    Total clusters        : {len(final_clusters)}")
    print(f"    Cross-CPSE duplicates : {len(multi_cpse)}")
    print(f"    Same-CPSE duplicates  : {len(multi_same)}")
    print(f"    Unique singletons     : {len(singletons)}")
    print(f"    Ejected (→ singletons): {ejected_total}")
    print(f"      - Wrong series      : {sum(1 for _ in [c for c in raw_clusters if get_category(c[0]) == 'Bearing'])}")

    # ── Write to DB ───────────────────────────────────────────────
    # Only write clusters with 2+ members (cross-CPSE duplicates need national codes)
    clusters_to_save = [c for c in final_clusters if len(c) >= 2]
    print(f"\n  Writing {len(clusters_to_save)} multi-member clusters to database...")
    print(f"  (Excluding {len(singletons)} singletons — unique materials don't need national codes)")
    engine.save_clusters_to_db(clusters_to_save)
    print("\n✅  Clustering complete.")
    print(f"    Open http://localhost:5173 to view the dashboard.\n")


if __name__ == '__main__':
    run()

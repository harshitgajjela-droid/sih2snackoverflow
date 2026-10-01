#!/usr/bin/env python3
"""
Matching Engine for Material Master System
Implements text normalization, similarity scoring, and clustering for material deduplication
"""

import re
import sqlite3
from typing import List, Tuple, Dict, Any, Optional
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from rapidfuzz import fuzz, process
import numpy as np

class MaterialMatchingEngine:
    def __init__(self, db_path: str = 'materials.sqlite'):
        """Initialize the matching engine with database path and load models"""
        self.db_path = db_path
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.init_database()

    def init_database(self):
        """Initialize database tables if they don't exist"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Create clusters table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS clusters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                national_code TEXT UNIQUE NOT NULL,
                standardized_description TEXT NOT NULL,
                status TEXT DEFAULT 'Pending',
                confidence_score REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Create cluster_members table to map materials to clusters
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS cluster_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cluster_id INTEGER,
                material_id INTEGER,
                cpse TEXT,
                material_code TEXT,
                description TEXT,
                uom TEXT,
                FOREIGN KEY (cluster_id) REFERENCES clusters (id),
                FOREIGN KEY (material_id) REFERENCES materials (id)
            )
        ''')

        # Create audit log table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cluster_id INTEGER,
                action TEXT NOT NULL,
                performed_by TEXT DEFAULT 'system',
                performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                details TEXT,
                FOREIGN KEY (cluster_id) REFERENCES clusters (id)
            )
        ''')

        conn.commit()
        conn.close()

    def normalize_text(self, text: str) -> str:
        """
        Text Normalization: Clean strings, convert units, lowercase, remove special characters.
        Bearing series numbers (e.g. 6207, 6208, NU206) are preserved as-is so they
        don't get mistaken for pipe sizes and cause cross-series clustering.
        """
        if not text:
            return ""

        # Detect bearing descriptions early — preserve their series number tokens
        bearing_re = re.compile(
            r'\b(ball\s*bearing|roller\s*bearing|needle\s*bearing|deep\s*groove)\b',
            re.IGNORECASE
        )
        is_bearing = bool(bearing_re.search(text))

        text = text.lower().strip()

        unit_mappings = {
            r'\binch\b': 'inch',
            r'\blb\b': 'class',
            r'\blbs\b': 'class',
            r'\bpound\b': 'class',
            r'\b#\b': '',
            r'\brf\b': 'raised face',
            r'\brtj\b': 'ring type joint',
            r'\bfg\b': 'flange',
            r'\bcd\b': 'carbon steel',
            r'\bss\b': 'stainless steel',
            r'\bcs\b': 'carbon steel',
            r'\bmtr\b': 'meter',
            r'\bnos\b': 'number',
            r'\bpcs\b': 'pieces',
            r'\bea\b': 'each',
        }

        # Only expand "in" → "inch" for non-bearing items so bearing series
        # like "6208IN" or "NU206" are not corrupted
        if not is_bearing:
            unit_mappings[r'\bin\b'] = 'inch'
            unit_mappings[r'\bst\b'] = ''

        for pattern, replacement in unit_mappings.items():
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)

        text = re.sub(r'[^\w\s]', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()

        return text

    def extract_specs(self, description: str) -> Dict[str, Optional[str]]:
        """
        Regex Spec Extractor: Extract parameters (Size, Pressure Class, Material Grade)
        """
        specs = {
            'size': None,
            'pressure_class': None,
            'material_grade': None
        }

        if not description:
            return specs

        desc_upper = description.upper()

        # Extract size (patterns like "2 inch", "2\"", "DN50", etc.)
        size_patterns = [
            r'(\d+(?:\.\d+)?)\s*[\"\']?\s*inch',
            r'(\d+(?:\.\d+)?)\s*["\']',
            r'DN\s*(\d+)',
            r'(\d+)\s*mm',
            r'(\d+(?:\.\d+)?)\s*in'
        ]

        for pattern in size_patterns:
            match = re.search(pattern, desc_upper)
            if match:
                specs['size'] = match.group(1)
                break

        # Extract pressure class (patterns like "150#", "150LB", "Class 150", etc.)
        pressure_patterns = [
            r'(\d+)\s*#\s*',
            r'(\d+)\s*LB\s*',
            r'CLASS\s*(\d+)',
            r'(\d+)\s*RATING',
            r'PN\s*(\d+)'
        ]

        for pattern in pressure_patterns:
            match = re.search(pattern, desc_upper)
            if match:
                specs['pressure_class'] = match.group(1)
                break

        # Extract material grade (patterns like SS316, SS304, CS, etc.)
        grade_patterns = [
            r'(SS\d{3})',
            r'(CS)',
            r'(BRASS)',
            r'(BRONZE)',
            r'(ALLOY\s*\d*)',
            r'(CARBON\s*STEEL)',
            r'(STAINLESS\s*STEEL)'
        ]

        for pattern in grade_patterns:
            match = re.search(pattern, desc_upper)
            if match:
                specs['material_grade'] = match.group(1)
                break

        return specs

    def compute_similarity(self, text1: str, text2: str) -> float:
        """
        Similarity Score Computation:
        - Compute Sentence-Transformers embeddings and cosine similarity
        - Compute RapidFuzz string match scores
        - Blend scores: Composite Score = (0.6 * Cosine_Sim) + (0.4 * Fuzzy_Sim)
        """
        if not text1 or not text2:
            return 0.0

        # Normalize texts
        norm_text1 = self.normalize_text(text1)
        norm_text2 = self.normalize_text(text2)

        # Compute cosine similarity using Sentence Transformers
        embeddings = self.model.encode([norm_text1, norm_text2])
        cosine_sim = cosine_similarity([embeddings[0]], [embeddings[1]])[0][0]

        # Compute fuzzy similarity using RapidFuzz
        fuzzy_sim = fuzz.ratio(norm_text1, norm_text2) / 100.0

        # Blend scores
        composite_score = (0.6 * cosine_sim) + (0.4 * fuzzy_sim)

        return composite_score

    def get_all_materials(self) -> List[Dict[str, Any]]:
        """Retrieve all materials from the database"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            SELECT id, cpse, material_code, description, uom, category, sub_category
            FROM materials
            ORDER BY cpse, material_code
        ''')

        materials = [dict(row) for row in cursor.fetchall()]
        conn.close()

        return materials

    def cluster_materials(self, similarity_threshold: float = 0.82) -> List[List[Dict[str, Any]]]:
        """
        Clustering & Code Generation:
        - Group items with composite similarity > 82% into a single cluster
        - Auto-generate Common National Material Code
        - Derive standardized description
        """
        materials = self.get_all_materials()

        if not materials:
            return []

        # Create similarity matrix
        n = len(materials)
        similarity_matrix = np.zeros((n, n))

        # Pre-compute all embeddings in a single batch pass (O(N) instead of O(N²))
        descriptions = [m['description'] for m in materials]
        normalized_descriptions = [self.normalize_text(d) for d in descriptions]
        all_embeddings = self.model.encode(normalized_descriptions, batch_size=32, show_progress_bar=False)

        # Compute full cosine similarity matrix in one vectorized operation
        from sklearn.metrics.pairwise import cosine_similarity as cos_sim_matrix
        cosine_matrix = cos_sim_matrix(all_embeddings)

        # Calculate similarity scores using precomputed embeddings + fuzzy
        for i in range(n):
            for j in range(i+1, n):
                cosine_sim = float(cosine_matrix[i][j])
                fuzzy_sim = fuzz.ratio(normalized_descriptions[i], normalized_descriptions[j]) / 100.0
                sim_score = (0.6 * cosine_sim) + (0.4 * fuzzy_sim)
                similarity_matrix[i][j] = sim_score
                similarity_matrix[j][i] = sim_score

        # Perform clustering using threshold
        clusters = []
        visited = [False] * n

        for i in range(n):
            if not visited[i]:
                cluster = [materials[i]]
                visited[i] = True

                # Find all similar items
                for j in range(n):
                    if not visited[j] and similarity_matrix[i][j] >= similarity_threshold:
                        cluster.append(materials[j])
                        visited[j] = True

                # Only add clusters with 2+ members (no singletons)
                if len(cluster) >= 2:
                    clusters.append(cluster)

        return clusters

    def generate_national_code(self, cluster: List[Dict[str, Any]], existing_codes: set = None) -> str:
        """
        Generate Common National Material Code based on cluster characteristics
        Format: NSMC-{CATEGORY}-{MATERIAL}-{SIZE}-{PRESSURE}
        """
        if not cluster:
            return "NSMC-UNKNOWN"

        if existing_codes is None:
            existing_codes = set()

        # Extract specs from first item in cluster
        first_item = cluster[0]
        specs = self.extract_specs(first_item['description'])

        # Determine category from description or use default
        desc_upper = first_item['description'].upper()
        if 'VALVE' in desc_upper or 'VLV' in desc_upper:
            category = 'VALV'
        elif 'PIPE' in desc_upper:
            category = 'PIPE'
        elif 'FLANGE' in desc_upper or 'FLG' in desc_upper or 'FLNG' in desc_upper:
            category = 'FLNG'
        elif 'BEARING' in desc_upper or 'BRG' in desc_upper or 'BEAR' in desc_upper:
            category = 'BRG'
        elif 'GASKET' in desc_upper or 'GKT' in desc_upper or 'GSKT' in desc_upper:
            category = 'GKT'
        else:
            category = 'GEN'

        # Material grade
        material = specs['material_grade'] or 'UNK'
        if material == 'SS':
            material = 'SS'  # Will append numbers if present in specs

        # Size (standardize to mm for consistency)
        size = specs['size'] or '000'
        try:
            size_val = float(size)
            # If it looks like inches, convert to mm
            if size_val < 100:  # Assume it's in inches if less than 100
                size_mm = int(size_val * 25.4)
            else:
                size_mm = int(size_val)
            size_str = f"{size_mm:03d}"
        except:
            size_str = "000"

        # Pressure class
        pressure = specs['pressure_class'] or '000'
        try:
            pressure_str = f"{int(pressure):03d}"
        except:
            pressure_str = "000"

        # Generate base national code — sanitize material to remove spaces
        material_clean = material.replace(' ', '_').upper()
        base_national_code = f"NSMC-{category}-{material_clean}-{size_str}-{pressure_str}"

        # Make it unique if it already exists
        national_code = base_national_code
        counter = 1
        while national_code in existing_codes:
            national_code = f"{base_national_code}-{counter:02d}"
            counter += 1

        return national_code

    def generate_standardized_description(self, cluster: List[Dict[str, Any]]) -> str:
        """
        Generate standardized description for a cluster
        Format: "{Item}, {Size} inch, {Material}, Class {Pressure}, {Ends}"
        """
        if not cluster:
            return "Unknown Material"

        # Use the first item as base and extract specs
        first_item = cluster[0]
        specs = self.extract_specs(first_item['description'])
        desc_upper = first_item['description'].upper()

        # Determine base item name
        if 'BALL' in desc_upper and 'VALVE' in desc_upper:
            base_item = "Ball Valve"
        elif 'GATE' in desc_upper and 'VALVE' in desc_upper:
            base_item = "Gate Valve"
        elif 'GLOBE' in desc_upper and 'VALVE' in desc_upper:
            base_item = "Globe Valve"
        elif 'CHECK' in desc_upper and 'VALVE' in desc_upper:
            base_item = "Check Valve"
        elif 'BUTTERFLY' in desc_upper and 'VALVE' in desc_upper:
            base_item = "Butterfly Valve"
        elif 'PIPE' in desc_upper:
            base_item = "Pipe"
        elif 'FLANGE' in desc_upper:
            base_item = "Flange"
        elif 'BEARING' in desc_upper:
            base_item = "Bearing"
        elif 'GASKET' in desc_upper:
            base_item = "Gasket"
        else:
            base_item = first_item['description'].title()

        # Add size
        size_str = ""
        if specs['size']:
            try:
                size_val = float(specs['size'])
                size_str = f"{size_val} inch"
            except:
                size_str = f"{specs['size']} inch"

        # Add material grade
        material_str = ""
        if specs['material_grade']:
            grade_map = {
                'SS316': 'SS316',
                'SS304': 'SS304',
                'CS': 'Carbon Steel',
                'BRASS': 'Brass'
            }
            material_str = grade_map.get(specs['material_grade'], specs['material_grade'])

        # Add pressure class
        pressure_str = ""
        if specs['pressure_class']:
            pressure_str = f"Class {specs['pressure_class']}"

        # Add ends/type
        ends_str = ""
        if 'RF' in desc_upper or 'RAISED FACE' in desc_upper:
            ends_str = "Raised Face"
        elif 'RTJ' in desc_upper or 'RING TYPE JOINT' in desc_upper:
            ends_str = "Ring Type Joint"
        elif 'FLANGED' in desc_upper:
            ends_str = "Flanged"
        elif 'THREADED' in desc_upper:
            ends_str = "Threaded"
        elif 'WELDED' in desc_upper:
            ends_str = "Welded"
        else:
            ends_str = "Standard"

        # Build standardized description
        parts = [base_item]
        if size_str:
            parts.append(size_str)
        if material_str:
            parts.append(material_str)
        if pressure_str:
            parts.append(pressure_str)
        if ends_str:
            parts.append(ends_str)

        return ", ".join(parts)

    def save_clusters_to_db(self, clusters: List[List[Dict[str, Any]]]):
        """Save clustered materials to the database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Clear existing clusters (for fresh run)
        cursor.execute('DELETE FROM cluster_members')
        cursor.execute('DELETE FROM clusters')

        # Track existing national codes to ensure uniqueness
        existing_codes = set()

        for cluster in clusters:
            if not cluster:
                continue

            # Generate national code and standardized description
            national_code = self.generate_national_code(cluster, existing_codes)
            existing_codes.add(national_code)
            standardized_description = self.generate_standardized_description(cluster)

            # Calculate average confidence score for the cluster
            # For simplicity, we'll use a placeholder - in practice, this could be based on intra-cluster similarities
            confidence_score = 0.85 + (len(cluster) * 0.02)  # More items = slightly higher confidence
            confidence_score = min(confidence_score, 0.99)  # Cap at 99%

            # Insert cluster
            cursor.execute('''
                INSERT INTO clusters (national_code, standardized_description, status, confidence_score)
                VALUES (?, ?, ?, ?)
            ''', (national_code, standardized_description, 'Pending', confidence_score))

            cluster_id = cursor.lastrowid

            # Insert cluster members
            for item in cluster:
                cursor.execute('''
                    INSERT INTO cluster_members
                    (cluster_id, material_id, cpse, material_code, description, uom)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (
                    cluster_id,
                    item['id'],
                    item['cpse'],
                    item['material_code'],
                    item['description'],
                    item['uom']
                ))

        conn.commit()
        conn.close()

    def get_clusters(self) -> List[Dict[str, Any]]:
        """Retrieve all clusters with their members"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            SELECT c.id, c.national_code, c.standardized_description,
                   c.status, c.confidence_score, c.created_at,
                   cm.cpse, cm.material_code, cm.description, cm.uom
            FROM clusters c
            LEFT JOIN cluster_members cm ON c.id = cm.cluster_id
            ORDER BY c.id, cm.cpse
        ''')

        rows = cursor.fetchall()
        conn.close()

        # Group by cluster
        clusters_dict = {}
        for row in rows:
            cluster_id = row['id']
            if cluster_id not in clusters_dict:
                clusters_dict[cluster_id] = {
                    'id': row['id'],
                    'national_code': row['national_code'],
                    'standardized_description': row['standardized_description'],
                    'status': row['status'],
                    'confidence_score': row['confidence_score'],
                    'created_at': row['created_at'],
                    'members': []
                }

            if row['cpse']:  # Only add if member exists
                clusters_dict[cluster_id]['members'].append({
                    'cpse': row['cpse'],
                    'material_code': row['material_code'],
                    'description': row['description'],
                    'uom': row['uom']
                })

        return list(clusters_dict.values())

    def approve_cluster(self, cluster_id: int) -> bool:
        """Update cluster status to Approved and log to audit trail"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            # Update cluster status
            cursor.execute('''
                UPDATE clusters SET status = 'Approved' WHERE id = ?
            ''', (cluster_id,))

            # Log to audit trail
            cursor.execute('''
                INSERT INTO audit_log (cluster_id, action, details)
                VALUES (?, ?, ?)
            ''', (cluster_id, 'APPROVED', f'Cluster {cluster_id} approved'))

            conn.commit()
            success = True
        except Exception as e:
            print(f"Error approving cluster: {e}")
            success = False
        finally:
            conn.close()

        return success

    def reject_cluster(self, cluster_id: int) -> bool:
        """Update cluster status to Rejected and log to audit trail"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            # Update cluster status
            cursor.execute('''
                UPDATE clusters SET status = 'Rejected' WHERE id = ?
            ''', (cluster_id,))

            # Log to audit trail
            cursor.execute('''
                INSERT INTO audit_log (cluster_id, action, details)
                VALUES (?, ?, ?)
            ''', (cluster_id, 'REJECTED', f'Cluster {cluster_id} rejected'))

            conn.commit()
            success = True
        except Exception as e:
            print(f"Error rejecting cluster: {e}")
            success = False
        finally:
            conn.close()

        return success

    def remove_cluster_member(self, cluster_id: int, material_code: str) -> Dict[str, Any]:
        """
        Remove a single material (identified by material_code) from a cluster.
        - If the cluster still has ≥1 member remaining → just delete the row.
        - If the cluster becomes empty → delete the cluster too.
        - The removed material is re-inserted as its own singleton cluster
          so it still appears in the mapping view as Pending.
        - Logs the action to audit_log.
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        try:
            # Fetch the member row we want to remove
            cursor.execute('''
                SELECT cm.id as cm_id, cm.material_id, cm.cpse,
                       cm.material_code, cm.description, cm.uom
                FROM cluster_members cm
                WHERE cm.cluster_id = ? AND cm.material_code = ?
            ''', (cluster_id, material_code))
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"Material {material_code} not found in cluster {cluster_id}")

            member = dict(row)

            # Delete from cluster_members
            cursor.execute('DELETE FROM cluster_members WHERE id = ?', (member['cm_id'],))

            # How many members remain?
            cursor.execute('SELECT COUNT(*) FROM cluster_members WHERE cluster_id = ?', (cluster_id,))
            remaining = cursor.fetchone()[0]

            if remaining == 0:
                cursor.execute('DELETE FROM clusters WHERE id = ?', (cluster_id,))

            # Re-insert removed material as its own singleton cluster
            singleton_code = f"NSMC-SOLO-{member['material_code'].replace(' ', '-')}"
            # Ensure uniqueness
            cursor.execute('SELECT COUNT(*) FROM clusters WHERE national_code = ?', (singleton_code,))
            if cursor.fetchone()[0] > 0:
                singleton_code = f"{singleton_code}-{member['material_id']}"

            cursor.execute('''
                INSERT INTO clusters (national_code, standardized_description, status, confidence_score)
                VALUES (?, ?, 'Pending', 0.70)
            ''', (singleton_code, member['description'][:120]))
            new_cluster_id = cursor.lastrowid

            cursor.execute('''
                INSERT INTO cluster_members
                    (cluster_id, material_id, cpse, material_code, description, uom)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (new_cluster_id, member['material_id'], member['cpse'],
                  member['material_code'], member['description'], member['uom']))

            # Audit log
            cursor.execute('''
                INSERT INTO audit_log (cluster_id, action, details)
                VALUES (?, 'MEMBER_REMOVED', ?)
            ''', (cluster_id, f"Removed {material_code} ({member['cpse']}) → new cluster {new_cluster_id}"))

            conn.commit()
            return {
                "message": f"Removed {material_code} from cluster {cluster_id}",
                "remaining_members": remaining,
                "new_singleton_cluster_id": new_cluster_id,
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def get_audit_trail(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieve recent approval history logs"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            SELECT al.id, al.cluster_id, al.action, al.performed_by,
                   al.performed_at, al.details,
                   c.national_code, c.standardized_description
            FROM audit_log al
            LEFT JOIN clusters c ON al.cluster_id = c.id
            ORDER BY al.performed_at DESC
            LIMIT ?
        ''', (limit,))

        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()

        return rows

    def get_overview_stats(self) -> Dict[str, Any]:
        """Get overview statistics for the dashboard"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Total items
        cursor.execute('SELECT COUNT(*) FROM materials')
        total_items = cursor.fetchone()[0]

        # Total clusters
        cursor.execute('SELECT COUNT(*) FROM clusters')
        total_clusters = cursor.fetchone()[0]

        # Approved clusters
        cursor.execute('SELECT COUNT(*) FROM clusters WHERE status = "Approved"')
        approved_clusters = cursor.fetchone()[0]

        # Rejected clusters
        cursor.execute('SELECT COUNT(*) FROM clusters WHERE status = "Rejected"')
        rejected_clusters = cursor.fetchone()[0]

        # Duplication reduction % (simplified calculation)
        if total_items > 0:
            reduction_pct = ((total_items - total_clusters) / total_items) * 100
        else:
            reduction_pct = 0

        # Estimated savings (placeholder calculation)
        # Assuming average savings of ₹5000 per duplicated item avoided
        duplicated_items = total_items - total_clusters
        estimated_savings = duplicated_items * 5000

        conn.close()

        return {
            'total_items': total_items,
            'total_clusters': total_clusters,
            'approved_clusters': approved_clusters,
            'rejected_clusters': rejected_clusters,
            'duplication_reduction_pct': round(reduction_pct, 2),
            'estimated_savings': estimated_savings
        }

    def get_mappings_for_table(self) -> List[Dict[str, Any]]:
        """Get full array for TanStack Table showing CPSE codes mapped to National Codes"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            SELECT m.cpse, m.material_code, m.description, m.uom,
                   c.national_code, c.standardized_description, c.status
            FROM materials m
            LEFT JOIN cluster_members cm ON m.id = cm.material_id
            LEFT JOIN clusters c ON cm.cluster_id = c.id
            ORDER BY m.cpse, m.material_code
        ''')

        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()

        return rows

def main():
    """Main function to demonstrate the matching engine"""
    print("Initializing Material Matching Engine...")
    engine = MaterialMatchingEngine()

    print("Clustering materials...")
    clusters = engine.cluster_materials(similarity_threshold=0.82)

    print(f"Found {len(clusters)} clusters")

    print("Saving clusters to database...")
    engine.save_clusters_to_db(clusters)

    print("Getting overview stats...")
    stats = engine.get_overview_stats()
    print(f"Overview Stats: {stats}")

    print("Getting clusters...")
    cluster_list = engine.get_clusters()
    for i, cluster in enumerate(cluster_list[:3]):  # Show first 3 clusters
        print(f"Cluster {i+1}: {cluster['national_code']} - {cluster['standardized_description']}")
        print(f"  Status: {cluster['status']}, Confidence: {cluster['confidence_score']:.2f}")
        print(f"  Members: {len(cluster['members'])}")
        for member in cluster['members'][:2]:  # Show first 2 members
            print(f"    [{member['cpse']}] {member['material_code']}: {member['description']}")
        if len(cluster['members']) > 2:
            print(f"    ... and {len(cluster['members']) - 2} more")
        print()

if __name__ == "__main__":
    main()
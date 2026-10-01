#!/usr/bin/env python3
"""
FastAPI Backend for National Unified Material Master System
"""

from fastapi import FastAPI, HTTPException, Path
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from matching_engine import MaterialMatchingEngine

app = FastAPI(
    title="Material Master System API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

matching_engine = MaterialMatchingEngine()


@app.get("/")
async def root():
    return {"message": "Material Master System API", "version": "1.0.0"}


@app.get("/api/overview-stats")
async def get_overview_stats():
    try:
        return matching_engine.get_overview_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/clusters")
async def get_clusters():
    try:
        return {"clusters": matching_engine.get_clusters()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/mappings")
async def get_mappings():
    try:
        return {"mappings": matching_engine.get_mappings_for_table()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/approve/{cluster_id}")
async def approve_cluster(cluster_id: int = Path(...)):
    try:
        if matching_engine.approve_cluster(cluster_id):
            return {"message": f"Cluster {cluster_id} approved", "status": "Approved"}
        raise HTTPException(status_code=400, detail="Approve failed")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/reject/{cluster_id}")
async def reject_cluster(cluster_id: int = Path(...)):
    try:
        if matching_engine.reject_cluster(cluster_id):
            return {"message": f"Cluster {cluster_id} rejected", "status": "Rejected"}
        raise HTTPException(status_code=400, detail="Reject failed")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/clusters/{cluster_id}/members/{material_code}")
async def remove_cluster_member(
    cluster_id: int = Path(...),
    material_code: str = Path(...)
):
    """
    Remove a single material from a cluster.
    If the cluster drops to 0 members the cluster itself is deleted.
    The removed material becomes a standalone singleton cluster.
    """
    try:
        result = matching_engine.remove_cluster_member(cluster_id, material_code)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/audit-trail")
async def get_audit_trail(limit: int = 50):
    try:
        return {"audit_trail": matching_engine.get_audit_trail(limit=limit)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/run-clustering")
async def run_clustering():
    """Re-runs cluster.py against the current materials DB."""
    try:
        import subprocess, sys, os
        script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cluster.py')
        result = subprocess.run(
            [sys.executable, script],
            capture_output=True, text=True,
            cwd=os.path.dirname(os.path.abspath(__file__))
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr)
        return {"message": "Clustering complete", "output": result.stdout}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import audit, auth_router, briefs, clients, dashboard, pipeline

app = FastAPI(title="Signal API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix="/api/auth")
app.include_router(pipeline.router, prefix="/api/pipeline")
app.include_router(briefs.router, prefix="/api/briefs")
app.include_router(clients.router, prefix="/api/clients")
app.include_router(dashboard.router, prefix="/api/dashboard")
app.include_router(audit.router, prefix="/api/audit")


@app.get("/")
def root():
    return {"app": "Signal", "version": "1.0.0", "status": "running"}


@app.on_event("startup")
async def on_startup():
    print("Signal API running on http://localhost:8000")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)

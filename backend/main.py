"""
RS Dataset Factory - FastAPI 主入口
遥感数据集制作系统后端服务
支持多种遥感图像格式的上传、处理和下载
"""
import os
import sys
from pathlib import Path

# 防止 Windows GBK stdout 在 print emoji / 非 GBK 字符时崩溃（例如 ⚠️ \u26a0）
# 必须在任何 print / 任何子模块导入之前执行
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).parent.parent))
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from fastapi import FastAPI, WebSocket, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware

from backend.api.routes import router as api_router
from backend.api.websocket import websocket_endpoint
from backend.auth import router as auth_router
from backend.config import UPLOAD_DIR, OUTPUT_DIR, API_CONFIG


class CORSDownloadMiddleware(BaseHTTPMiddleware):
    """
    自定义中间件，为下载路由添加额外的 CORS 头
    确保前端能够正确下载文件并获取文件名
    """
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # 为下载路由添加额外的 CORS 头
        if "/api/download/" in request.url.path:
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "*"
            response.headers["Access-Control-Expose-Headers"] = "Content-Disposition, Content-Length, Content-Type"
        
        return response


app = FastAPI(
    title="RS Dataset Factory",
    description="遥感数据集制作系统 - 基于 SAM3/PRISM 的智能语义分割数据集生成工具",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# 添加 CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length", "Content-Type"],
)

# 添加自定义下载 CORS 中间件
app.add_middleware(CORSDownloadMiddleware)

# 注册路由
app.include_router(auth_router, prefix="/api", tags=["认证"])
app.include_router(api_router, prefix="/api", tags=["API"])

# 确保目录存在
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 挂载静态文件服务
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")


@app.websocket("/ws/{task_id}")
async def websocket_route(websocket: WebSocket, task_id: str):
    """WebSocket 进度推送端点"""
    await websocket_endpoint(websocket, task_id)


@app.get("/")
async def root():
    """根路径"""
    return {
        "name": "RS Dataset Factory",
        "version": "1.0.0",
        "description": "遥感数据集制作系统",
        "docs": "/docs",
        "api": "/api",
        "supported_formats": [".tif", ".tiff", ".png", ".jpg", ".jpeg", ".img", ".hdf", ".nc"],
    }


@app.options("/{full_path:path}")
async def options_handler(full_path: str):
    """
    处理所有 OPTIONS 预检请求
    确保 CORS 预检请求能够正确响应
    """
    return Response(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Expose-Headers": "Content-Disposition, Content-Length, Content-Type",
        }
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理，避免裸 500"""
    import traceback
    traceback.print_exc()
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=500,
        content={"detail": f"服务器内部错误: {str(exc)[:200]}"}
    )


@app.on_event("startup")
async def startup_event():
    """启动事件"""
    # 清理卡死的任务
    from backend.api.routes import tasks_db, save_tasks
    stuck = 0
    for tid, task in tasks_db.items():
        s = task.get("status", "")
        if hasattr(s, 'value'):
            s = s.value
        if s == "processing":
            task["status"] = "failed"
            task["message"] = "服务重启，任务已中断"
            stuck += 1
    if stuck:
        save_tasks()
        print(f"[启动] 已清理 {stuck} 个卡死任务")

    print("=" * 60)
    print("RS Dataset Factory - 遥感数据集制作系统")
    print("=" * 60)
    print(f"上传目录: {UPLOAD_DIR}")
    print(f"输出目录: {OUTPUT_DIR}")
    print(f"API 文档: http://localhost:{API_CONFIG['port']}/docs")
    print("支持格式: .tif, .tiff, .png, .jpg, .jpeg, .img, .hdf, .nc")
    print("=" * 60)


@app.on_event("shutdown")
async def shutdown_event():
    """关闭事件"""
    print("RS Dataset Factory - 正在关闭...")


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host=API_CONFIG["host"],
        port=API_CONFIG["port"],
        reload=API_CONFIG["reload"]
    )

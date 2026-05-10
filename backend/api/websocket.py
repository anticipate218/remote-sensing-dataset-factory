"""
RS Dataset Factory - WebSocket 進度推送
"""
import asyncio
import json
from typing import Dict, Set
from datetime import datetime

from fastapi import WebSocket, WebSocketDisconnect


class ConnectionManager:
    """WebSocket 連接管理器"""
    
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, task_id: str):
        """建立連接"""
        await websocket.accept()
        if task_id not in self.active_connections:
            self.active_connections[task_id] = set()
        self.active_connections[task_id].add(websocket)
    
    def disconnect(self, websocket: WebSocket, task_id: str):
        """斷開連接"""
        if task_id in self.active_connections:
            self.active_connections[task_id].discard(websocket)
            if not self.active_connections[task_id]:
                del self.active_connections[task_id]
    
    async def send_progress(self, task_id: str, data: dict):
        """向訂閱該任務的所有客戶端發送進度更新"""
        if task_id not in self.active_connections:
            return
        
        message = json.dumps({
            "type": "progress",
            "task_id": task_id,
            "timestamp": datetime.now().isoformat(),
            **data
        })
        
        dead_connections = set()
        for connection in self.active_connections[task_id]:
            try:
                await connection.send_text(message)
            except Exception:
                dead_connections.add(connection)
        
        for conn in dead_connections:
            self.active_connections[task_id].discard(conn)
    
    async def broadcast(self, message: str):
        """廣播消息到所有連接"""
        for connections in self.active_connections.values():
            for connection in connections:
                try:
                    await connection.send_text(message)
                except Exception:
                    pass


manager = ConnectionManager()


async def websocket_endpoint(websocket: WebSocket, task_id: str):
    """
    WebSocket 端點
    客戶端連接後接收指定任務的實時進度更新
    """
    await manager.connect(websocket, task_id)
    
    try:
        from backend.api.routes import tasks_db
        
        if task_id in tasks_db:
            task = tasks_db[task_id]
            await websocket.send_json({
                "type": "initial",
                "task_id": task_id,
                "status": task["status"],
                "progress": task["progress"],
                "current_step": task["current_step"],
                "message": task["message"]
            })
        
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                
                if data == "ping":
                    await websocket.send_text("pong")
                elif data == "status":
                    if task_id in tasks_db:
                        task = tasks_db[task_id]
                        await websocket.send_json({
                            "type": "status",
                            "task_id": task_id,
                            "status": task["status"],
                            "progress": task["progress"],
                            "current_step": task["current_step"],
                            "message": task["message"]
                        })
                        
            except asyncio.TimeoutError:
                await websocket.send_text("ping")
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, task_id)
    except Exception as e:
        manager.disconnect(websocket, task_id)


class ProgressReporter:
    """進度報告器，用於在任務處理中發送 WebSocket 更新"""
    
    def __init__(self, task_id: str):
        self.task_id = task_id
        self.start_time = datetime.now()
    
    async def report(
        self,
        stage: str,
        progress: float,
        message: str,
        current_crop: int = 0,
        total_crops: int = 0
    ):
        """報告進度"""
        elapsed = (datetime.now() - self.start_time).total_seconds()
        
        estimated_remaining = 0
        if progress > 0:
            estimated_remaining = elapsed / progress * (100 - progress)
        
        await manager.send_progress(self.task_id, {
            "status": "processing",
            "progress": progress,
            "current_step": stage,
            "message": message,
            "current_crop": current_crop,
            "total_crops": total_crops,
            "elapsed_time": elapsed,
            "estimated_remaining": estimated_remaining
        })
    
    async def complete(self, result: dict):
        """報告完成"""
        await manager.send_progress(self.task_id, {
            "status": "completed",
            "progress": 100.0,
            "current_step": "completed",
            "message": "Dataset generation completed",
            "result": result
        })
    
    async def error(self, error_message: str):
        """報告錯誤"""
        await manager.send_progress(self.task_id, {
            "status": "failed",
            "progress": 0,
            "current_step": "error",
            "message": error_message,
            "error": error_message
        })

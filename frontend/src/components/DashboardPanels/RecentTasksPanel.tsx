import React, { useState, useEffect, useRef } from 'react'
import { WidgetPanel } from '../MFLayout'

interface TaskItem {
  name: string
  method: string
  status: string
  time: string
  statusColor: string
  statusIcon: string
}

const generateTasks = (): TaskItem[] => {
  const entries = [
    { name: '目标检测-港口', method: 'YOLOv8-OBB' },
    { name: '语义分割-城市', method: 'SAM3-ViT-H' },
    { name: '超分辨率-农田', method: 'TTST ×4' },
    { name: '边缘提取-河流', method: 'Canny+DL' },
    { name: '去云去雾-山区', method: 'DehazeNet' },
    { name: '变化检测-建筑', method: 'BIT-CD' },
  ]
  const statuses = [
    { text: '已完成', color: '#74fabd', icon: '●' },
    { text: '处理中', color: '#5bc7fa', icon: '◐' },
    { text: '转移中', color: '#f0c040', icon: '◑' },
  ]
  return entries.map((e) => {
    const st = statuses[Math.floor(Math.random() * statuses.length)]
    const h = String(Math.floor(Math.random() * 24)).padStart(2, '0')
    const m = String(Math.floor(Math.random() * 60)).padStart(2, '0')
    return { name: e.name, method: e.method, status: st.text, time: `${h}:${m}`, statusColor: st.color, statusIcon: st.icon }
  })
}

const RecentTasksPanel: React.FC = () => {
  const [tasks, setTasks] = useState<TaskItem[]>(generateTasks)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setInterval(() => {
      setTasks((prev) => {
        const next = [...prev]
        const newItem = generateTasks()[0]
        next.push(newItem)
        next.shift()
        return next
      })
    }, 3000)
    return () => clearInterval(timer)
  }, [])

  return (
    <WidgetPanel title="最近任务列表" animationDelay={400}>
      <div ref={listRef} style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {tasks.map((task, i) => (
          <div
            key={`${task.name}-${i}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '5px 10px',
              background: i % 2 === 0 ? 'rgba(5, 50, 106, 0.25)' : 'transparent',
              borderRadius: 4,
              fontSize: 12,
              transition: 'all 0.5s ease',
              borderLeft: `2px solid ${task.statusColor}22`,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: '#fff' }}>{task.name}</span>
              <span style={{
                marginLeft: 6, fontSize: 9, color: '#b9cfff', opacity: 0.4,
                fontFamily: "'Source Serif 4', serif", fontStyle: 'italic',
              }}>{task.method}</span>
            </div>
            <span style={{
              color: task.statusColor,
              minWidth: 48,
              textAlign: 'center',
              fontSize: 10,
              display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center',
            }}>
              <span style={{ fontSize: 8 }}>{task.statusIcon}</span>
              {task.status}
            </span>
            <span style={{
              color: '#b9cfff', opacity: 0.5, minWidth: 40, textAlign: 'right',
              fontFamily: "'DincorosBlack'", fontSize: 11,
            }}>{task.time}</span>
          </div>
        ))}
      </div>
    </WidgetPanel>
  )
}

export default RecentTasksPanel

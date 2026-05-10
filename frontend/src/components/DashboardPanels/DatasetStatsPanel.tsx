import React, { useEffect } from 'react'
import { WidgetPanel } from '../MFLayout'
import { useEcharts } from '@/hooks/useEcharts'
import * as echarts from 'echarts/core'

const METRICS = [
  { key: 'mIoU', val: '82.3', color: '#74fabd' },
  { key: 'F₁', val: '87.6', color: '#74f7fd' },
  { key: 'OA', val: '93.1', color: '#5bc7fa' },
]

const DatasetStatsPanel: React.FC = () => {
  const { containerRef, setOption } = useEcharts()

  useEffect(() => {
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
    const data1 = [12, 18, 25, 15, 30, 22, 35, 28, 40, 32, 38, 45]
    const data2 = [8, 12, 18, 10, 22, 16, 28, 20, 32, 25, 30, 38]

    setOption({
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(5, 50, 106, 0.9)',
        borderColor: 'rgba(116, 247, 253, 0.3)',
        textStyle: { color: '#fff', fontSize: 12 },
      },
      legend: {
        data: ['Produced', 'Validated'],
        textStyle: { color: '#b9cfff', fontSize: 10, fontFamily: "'Source Serif 4', serif" },
        top: 0,
        right: 10,
        itemWidth: 12,
        itemHeight: 8,
      },
      grid: { top: 30, right: 15, bottom: 25, left: 40 },
      xAxis: {
        type: 'category',
        data: months,
        axisLine: { lineStyle: { color: 'rgba(200,200,200,0.12)' } },
        axisLabel: { color: '#b9cfff', fontSize: 10 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        name: 'Count',
        nameTextStyle: { color: '#b9cfff', fontSize: 9, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', padding: [0, 40, 0, 0] },
        splitLine: { lineStyle: { color: 'rgba(200,200,200,0.08)', type: 'dashed' } },
        axisLabel: { color: '#b9cfff', fontSize: 10 },
      },
      series: [
        {
          name: 'Produced',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { color: '#74fabd', width: 2 },
          itemStyle: { color: '#74fabd' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(116, 250, 189, 0.35)' },
              { offset: 1, color: 'rgba(116, 250, 189, 0.02)' },
            ]),
          },
          data: data1,
        },
        {
          name: 'Validated',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { color: '#5bc7fa', width: 2 },
          itemStyle: { color: '#5bc7fa' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(91, 199, 250, 0.35)' },
              { offset: 1, color: 'rgba(91, 199, 250, 0.02)' },
            ]),
          },
          data: data2,
        },
      ],
    })
  }, [setOption])

  return (
    <WidgetPanel title="数据集生产统计" animationDelay={300}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Academic metrics row */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexShrink: 0 }}>
          {METRICS.map((m) => (
            <div key={m.key} style={{
              flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4,
              padding: '3px 0', background: 'rgba(5,50,106,0.35)', borderRadius: 4,
              border: '1px solid rgba(91,199,250,0.08)',
            }}>
              <span style={{ fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', fontSize: 10, color: '#b9cfff', opacity: 0.6 }}>{m.key}</span>
              <span style={{ fontFamily: "'DincorosBlack'", fontSize: 14, color: m.color }}>{m.val}<span style={{ fontSize: 9, opacity: 0.5 }}>%</span></span>
            </div>
          ))}
        </div>
        <div ref={containerRef} style={{ width: '100%', flex: 1, minHeight: 0 }} />
      </div>
    </WidgetPanel>
  )
}

export default DatasetStatsPanel

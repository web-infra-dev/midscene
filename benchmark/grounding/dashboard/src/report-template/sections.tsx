import {
  Box,
  Button,
  Collapse,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import {
  ERROR_CELL_COLORS,
  LOW_CONFIDENCE_CELL_COLORS,
} from '../shared/task-detail/common';

export function ToggleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Box>
      <Button size="small" onClick={onToggle}>
        {open ? '▼' : '▶'} {title}
      </Button>
      <Collapse in={open}>{children}</Collapse>
    </Box>
  );
}

export function ReportColorLegendSection({
  open,
  onToggle,
  scoreLabel = '命中率',
}: {
  open: boolean;
  onToggle: () => void;
  scoreLabel?: string;
}) {
  const items = [
    {
      label: '深紫色',
      description: '存在错误：该单元格对应的请求里至少有一次报错。',
      colors: ERROR_CELL_COLORS,
    },
    {
      label: '深灰色',
      description:
        scoreLabel === '答对率'
          ? '结果不完整：实际请求次数小于计划迭代次数，样本不足。'
          : '结果不完整：成功且可解析的次数小于计划迭代次数，样本不足。',
      colors: LOW_CONFIDENCE_CELL_COLORS,
    },
    {
      label: '浅灰色',
      description: '无数据：没有可用于统计的结果。',
      colors: { backgroundColor: '#e0e0e0', color: '#000' },
    },
    {
      label: '绿色',
      description: `${scoreLabel} 100%。`,
      colors: { backgroundColor: '#66bb6a', color: '#000' },
    },
    {
      label: '浅绿色',
      description: `${scoreLabel} >= 90%。`,
      colors: { backgroundColor: '#c8e6c9', color: '#000' },
    },
    {
      label: '浅黄色',
      description: `${scoreLabel} >= 30% 且 < 90%。`,
      colors: { backgroundColor: '#fff9c4', color: '#000' },
    },
    {
      label: '浅红色',
      description: `${scoreLabel} < 30%。`,
      colors: { backgroundColor: '#ffcdd2', color: '#000' },
    },
  ];

  return (
    <ToggleSection title="表格颜色说明" open={open} onToggle={onToggle}>
      <Stack spacing={0.75} sx={{ mt: 0.5 }}>
        {items.map((item) => (
          <Stack
            key={item.label}
            direction="row"
            spacing={1}
            alignItems="center"
          >
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: 0.5,
                border: '1px solid rgba(15, 23, 42, 0.16)',
                backgroundColor: item.colors.backgroundColor,
              }}
            />
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, minWidth: 56 }}
            >
              {item.label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {item.description}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </ToggleSection>
  );
}

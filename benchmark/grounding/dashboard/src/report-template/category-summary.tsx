import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { summarizeCategories } from './category-summary-data';
import type { ReportData } from './report-types';

export function CategorySummary({ data }: { data: ReportData }) {
  const rows = summarizeCategories(data);
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6">平台与分类成绩</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        通过率 = 正确答案数 /
        全部计划请求数。调用或解析失败计错；未执行单独标注。未完成时只表示当前已确认通过的占比，不是最终成绩。
      </Typography>
      <TableContainer>
        <Table size="small" aria-label="平台与分类成绩">
          <TableHead>
            <TableRow>
              <TableCell>平台</TableCell>
              <TableCell>分类</TableCell>
              {data.modelCatalog.map((model) => (
                <TableCell key={model.modelId} align="right">
                  {model.modelAlias}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.platform}-${row.category}`}>
                <TableCell>{row.platform}</TableCell>
                <TableCell>{row.category}</TableCell>
                {data.modelCatalog.map((model) => {
                  const score = row.scores.get(model.modelId);
                  return (
                    <TableCell key={model.modelId} align="right">
                      {score?.total
                        ? `${((score.correct / score.total) * 100).toFixed(2)}% (${score.correct}/${score.total})`
                        : '—'}
                      {score?.pending ? ` · 未执行 ${score.pending}` : ''}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

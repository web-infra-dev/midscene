import { Box, Chip, Stack, Typography } from '@mui/material';
import type {
  BBox,
  ErrorDetail,
  LocationRequestRecord,
} from '../../../../evaluation/task-types.js';

type ImageType = 'sd' | 'hd';

export const imageTypeLabel: Record<ImageType, string> = {
  sd: '标清图',
  hd: '高清图',
};

export const imageTypeTagSx: Record<ImageType, Record<string, string>> = {
  sd: {
    color: '#0d47a1',
    backgroundColor: '#e3f2fd',
    border: '1px solid #bbdefb',
  },
  hd: {
    color: '#7b1fa2',
    backgroundColor: '#f3e5f5',
    border: '1px solid #e1bee7',
  },
};

export const caseTagLabel: Record<string, string> = {
  no_crop: '不宜裁剪',
  very_simple: '非常简单',
  image_too_blurry: '图过于糊',
  prompt_unclear: '提示词不清晰',
  horizontal_repeat: '横向重复',
  easy_to_fail: '容易翻车',
  too_few_element_pixels: '元素像素偏少',
  evaluation_import: 'evaluation 导入',
};

export function extractHttpStatusCode(
  errorMessage: string | undefined,
): string | null {
  if (!errorMessage) return null;
  const match = errorMessage.match(/^\s*(\d{3})\b/);
  return match?.[1] ?? null;
}

function getErrorDebugText(
  errorDetail?: ErrorDetail | null,
  summaryText?: string | null,
): string | null {
  if (!errorDetail) {
    return null;
  }

  const stackText = errorDetail.stack?.trim();
  if (stackText) {
    return stackText;
  }

  const rawText = errorDetail.raw?.trim();
  if (rawText) {
    return rawText;
  }

  const fallbackText = [errorDetail.name?.trim(), errorDetail.message?.trim()]
    .filter(Boolean)
    .join(': ')
    .trim();

  if (!fallbackText) {
    return null;
  }

  return fallbackText === (summaryText ?? '').trim() ? null : fallbackText;
}

export function ErrorDebugDisclosure({
  errorDetail,
  summaryText,
}: {
  errorDetail?: ErrorDetail | null;
  summaryText?: string | null;
}) {
  const debugText = getErrorDebugText(errorDetail, summaryText);
  if (!debugText) {
    return null;
  }

  return (
    <Box
      component="details"
      sx={{
        mt: 0.25,
        '& > summary': {
          cursor: 'pointer',
          color: '#ad1457',
          fontSize: '0.75rem',
          userSelect: 'none',
        },
      }}
    >
      <Box component="summary">查看原始错误 / 错误栈</Box>
      <Typography
        variant="caption"
        component="pre"
        sx={{
          color: '#c62828',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          fontFamily: 'monospace',
          fontSize: '0.75rem',
          backgroundColor: '#ffebee',
          p: 0.75,
          borderRadius: 0.5,
          maxHeight: 220,
          overflow: 'auto',
          m: '6px 0 0',
        }}
      >
        {debugText}
      </Typography>
    </Box>
  );
}

export function getSuccessfulCenter(req: LocationRequestRecord): {
  success: boolean;
  center: { x: number; y: number } | null;
} {
  if (req.error) {
    return { success: false, center: null };
  }

  return {
    success: req.locate.success,
    center: req.locate.success ? req.locate.center : null,
  };
}

export function getRateCellColors(
  rate: number | null,
  lowConfidence = false,
): {
  backgroundColor: string;
  color: string;
} {
  if (lowConfidence) {
    return LOW_CONFIDENCE_CELL_COLORS;
  }

  if (rate === null) {
    return {
      backgroundColor: '#e0e0e0',
      color: '#000',
    };
  }

  if (rate >= 1) {
    return {
      backgroundColor: '#66bb6a',
      color: '#000',
    };
  }

  if (rate >= 0.9) {
    return {
      backgroundColor: '#c8e6c9',
      color: '#000',
    };
  }

  if (rate >= 0.3) {
    return {
      backgroundColor: '#fff9c4',
      color: '#000',
    };
  }

  return {
    backgroundColor: '#ffcdd2',
    color: '#000',
  };
}

export const LOW_CONFIDENCE_CELL_COLORS = {
  backgroundColor: '#212121',
  color: '#fff',
} as const;

export const ERROR_CELL_COLORS = {
  backgroundColor: '#4617C9',
  color: '#fff',
} as const;

export function getRateBand(
  rate: number | null,
): 'low' | 'mid' | 'high' | null {
  if (rate == null) return null;
  if (rate < 0.3) return 'low';
  if (rate < 0.9) return 'mid';
  return 'high';
}

export function CaseNameCell({
  displayName,
  imageType,
  caseTags,
  onDisplayNameClick,
}: {
  displayName: string;
  imageType: ImageType;
  caseTags: string[];
  onDisplayNameClick?: () => void;
}) {
  return (
    <Stack spacing={0.35}>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Typography
          component="span"
          onClick={onDisplayNameClick}
          sx={
            onDisplayNameClick
              ? {
                  cursor: 'pointer',
                  '&:hover': {
                    color: 'primary.main',
                  },
                }
              : undefined
          }
        >
          {displayName}
        </Typography>
        <Typography
          component="span"
          sx={{
            fontSize: '0.65rem',
            px: 0.5,
            py: 0.1,
            borderRadius: 0.5,
            whiteSpace: 'nowrap',
            ...imageTypeTagSx[imageType],
          }}
        >
          {imageTypeLabel[imageType]}
        </Typography>
      </Stack>
      {caseTags.length > 0 ? (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          {caseTags.map((tag) => (
            <Chip
              key={`${displayName}-${tag}`}
              size="small"
              label={caseTagLabel[tag] ?? tag}
              sx={{
                height: 18,
                '& .MuiChip-label': {
                  px: 0.6,
                  fontSize: '0.65rem',
                },
              }}
            />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

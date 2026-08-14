import {
  getDailyBusinessStatementExportFilename,
  serializeDailyBusinessStatementWorkbook,
} from '@/lib/export/daily-business-statement-xlsx';
import type { DailyBusinessStatement } from '@/types/daily-business-statement';

export function downloadDailyBusinessStatement(statement: DailyBusinessStatement): void {
  const bytes = serializeDailyBusinessStatementWorkbook(statement);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = getDailyBusinessStatementExportFilename(statement.reportDate);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

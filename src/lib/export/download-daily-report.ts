import {
  getDailyReportExportFilename,
  serializeDailyReportWorkbook,
} from '@/lib/export/daily-report-xlsx';
import type { DailyReportData } from '@/types/daily-report';

export function downloadDailyReport(report: DailyReportData): void {
  const bytes = serializeDailyReportWorkbook(report);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = getDailyReportExportFilename(report.reportDate);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

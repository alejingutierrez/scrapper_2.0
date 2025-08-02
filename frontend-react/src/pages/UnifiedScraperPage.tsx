import React, { useState } from 'react';
import { Box, Typography, TextField, Button, LinearProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@mui/material';
import { apiService } from '../services/api';
import * as XLSX from 'xlsx';

interface JobInfo {
  id: string;
  url: string;
  status: string;
  progress?: {
    total: number;
    completed: number;
    success: number;
    failed: number;
    percent: string;
  };
}

export const UnifiedScraperPage: React.FC = () => {
  const [urlInput, setUrlInput] = useState('');
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [results, setResults] = useState<any[]>([]);

  // Start scraping for each URL entered
  const handleStart = async () => {
    const urls = urlInput
      .split(/\n|,|;|\s+/)
      .map((u) => u.trim())
      .filter((u) => u);
    for (const url of urls) {
      try {
        const resp = await apiService.startScraping({ domains: [url] });
        const job: JobInfo = { id: resp.task_id, url, status: 'PENDING' };
        setJobs((prev) => [...prev, job]);
        pollStatus(resp.task_id);
        pollResults(resp.task_id);
      } catch (e) {
        console.error('Failed to start job for', url, e);
      }
    }
    setUrlInput('');
  };

  // Poll status for a job
  const pollStatus = (taskId: string) => {
    const interval = setInterval(async () => {
      try {
        const status = await apiService.getJobStatus(taskId);
        setJobs((prev) =>
          prev.map((j) => (j.id === taskId ? { ...j, status: status.status, progress: status.progress } : j))
        );
        if (status.status === 'COMPLETED' || status.status === 'FAILED' || status.status === 'CANCELLED') {
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Status polling error', err);
      }
    }, 2000);
  };

  // Poll results for a job
  const pollResults = (taskId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await apiService.getJobResults(taskId);
        if (res && (res as any).results) {
          const rows = (res as any).results.map((r: any) => ({ ...r, job_id: taskId }));
          setResults((prev) => {
            const others = prev.filter((p) => p.job_id !== taskId);
            return [...others, ...rows];
          });
        }
      } catch (err) {
        console.error('Results polling error', err);
      }
    }, 2000);
  };

  const handleDownload = () => {
    const ws = XLSX.utils.json_to_sheet(results);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, 'scraper_results.xlsx');
  };

  const handleStopAll = async () => {
    for (const job of jobs) {
      try {
        await apiService.stopJob(job.id);
      } catch (e) {
        console.error('Failed to stop job', job.id, e);
      }
    }
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 600 }}>
        Web Scraper Dashboard
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
        <TextField
          label="Enter website URLs (one per line)"
          multiline
          rows={3}
          fullWidth
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
        />
        <Button variant="contained" onClick={handleStart} sx={{ alignSelf: 'flex-start', mt: 1 }}>
          Start
        </Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Button variant="outlined" onClick={handleDownload} disabled={results.length === 0}>
          Download Excel
        </Button>
        <Button color="error" variant="outlined" onClick={handleStopAll} disabled={jobs.length === 0}>
          Stop All
        </Button>
      </Box>
      {jobs.map((job) => (
        <Box key={job.id} sx={{ mb: 2 }}>
          <Typography variant="subtitle1">{job.url}</Typography>
          {job.progress && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flexGrow: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={job.progress.total ? (job.progress.completed / job.progress.total) * 100 : 0}
                />
              </Box>
              <Typography variant="body2">
                {job.progress.completed}/{job.progress.total}
              </Typography>
            </Box>
          )}
        </Box>
      ))}
      {results.length > 0 && (
        <TableContainer component={Paper} sx={{ mt: 4 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Job</TableCell>
                <TableCell>URL</TableCell>
                <TableCell>Data</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {results.map((row, idx) => (
                <TableRow key={idx}>
                  <TableCell>{row.job_id}</TableCell>
                  <TableCell>{row.url || row.product_url || 'n/a'}</TableCell>
                  <TableCell>{row.title || JSON.stringify(row)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default UnifiedScraperPage;

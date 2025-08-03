import React from 'react';
import { AppBar, Toolbar, Typography, Box, Chip, Tooltip } from '@mui/material';
import { BugReport as BugIcon, PlayArrow as PlayIcon } from '@mui/icons-material';
import { useScraping } from '../context/ScrapingContext';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api';

const Navbar: React.FC = () => {
  const { state } = useScraping();

  const { isError: healthError } = useQuery({
    queryKey: ['health'],
    queryFn: apiService.healthCheck,
    refetchInterval: 30000,
    retry: 1,
  });

  const getStatusColor = () => {
    if (healthError) return 'error';
    if (state.isLoading) return 'warning';
    return 'success';
  };

  const getStatusText = () => {
    if (healthError) return 'Offline';
    if (state.isLoading) return 'Processing';
    return 'Online';
  };

  const runningJobs = state.jobs.filter(job => job.status === 'running').length;
  const completedJobs = state.jobs.filter(job => job.status === 'completed').length;
  const failedJobs = state.jobs.filter(job => job.status === 'failed').length;

  return (
    <AppBar
      position="sticky"
      sx={{
        background: 'linear-gradient(135deg, #1a1f2e 0%, #2d3748 100%)',
        borderBottom: '1px solid #2d3748',
      }}
    >
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', mr: 4 }}>
          <BugIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
            Scraper 2.0
          </Typography>
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Tooltip title={`System Status: ${getStatusText()}`}>
            <Chip
              label={getStatusText()}
              color={getStatusColor()}
              size="small"
              variant="outlined"
              sx={{ minWidth: 80 }}
            />
          </Tooltip>

          {runningJobs > 0 && (
            <Tooltip title={`${runningJobs} jobs running`}>
              <Chip
                icon={<PlayIcon />}
                label={runningJobs}
                color="warning"
                size="small"
                sx={{ minWidth: 60 }}
              />
            </Tooltip>
          )}

          {completedJobs > 0 && (
            <Tooltip title={`${completedJobs} jobs completed`}>
              <Chip
                label={completedJobs}
                color="success"
                size="small"
                sx={{ minWidth: 50 }}
              />
            </Tooltip>
          )}

          {failedJobs > 0 && (
            <Tooltip title={`${failedJobs} jobs failed`}>
              <Chip
                label={failedJobs}
                color="error"
                size="small"
                sx={{ minWidth: 50 }}
              />
            </Tooltip>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;

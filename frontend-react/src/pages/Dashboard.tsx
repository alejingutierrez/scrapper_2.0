import React, { useState, useEffect } from 'react';
import {
  // Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  TextField,
  Chip,
  LinearProgress,
  Alert,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  TrendingUp as TrendingUpIcon,
  Speed as SpeedIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Add as AddIcon,
  Domain as DomainIcon,
  Timer as TimerIcon,
} from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useScraping } from '../context/ScrapingContext';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api';

const Dashboard: React.FC = () => {
  const { state, dispatch } = useScraping();
  const [domains, setDomains] = useState<string>('');
  const [newJobDialog, setNewJobDialog] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Start scraping mutation
  const startScrapingMutation = useMutation({
    mutationFn: apiService.startScraping,
    onSuccess: (data) => {
      dispatch({
        type: 'START_JOB',
        payload: {
          id: data.task_id,
          domains: domains.split('\n').filter(d => d.trim()),
        },
      });
      setDomains('');
      setNewJobDialog(false);
      
      // Start polling for this job
      startPolling(data.task_id);
    },
    onError: (error: any) => {
      dispatch({
        type: 'SET_ERROR',
        payload: error.response?.data?.detail || 'Failed to start scraping job',
      });
    },
  });

  const stopJobMutation = useMutation({
    mutationFn: apiService.stopJob,
    onSuccess: (_data, taskId) => {
      dispatch({ type: 'STOP_JOB', payload: { id: taskId } });
      if (pollingInterval) clearInterval(pollingInterval);
    },
    onError: (error: any) => {
      dispatch({
        type: 'SET_ERROR',
        payload: error.response?.data?.detail || 'Failed to stop job',
      });
    },
  });

  // Polling function for job status
  const startPolling = (taskId: string) => {
    if (pollingInterval) clearInterval(pollingInterval);
    
    const interval = setInterval(async () => {
      try {
        const status = await apiService.getJobStatus(taskId);

        dispatch({
          type: 'UPDATE_JOB_PROGRESS',
          payload: {
            id: taskId,
            progress: status.progress,
          },
        });
        if (status.status === 'COMPLETED' || status.status === 'FAILED' || status.status === 'CANCELLED') {
          clearInterval(interval);
          if (status.status === 'COMPLETED') {
            dispatch({
              type: 'COMPLETE_JOB',
              payload: { id: taskId },
            });
          } else if (status.status === 'FAILED') {
            dispatch({
              type: 'FAIL_JOB',
              payload: { id: taskId, error: status.error || 'Job failed' },
            });
          } else {
            dispatch({ type: 'STOP_JOB', payload: { id: taskId } });
          }
        }
      } catch (error: any) {
        const message = error.response?.data?.detail || error.message || 'Polling error';
        console.error('Polling error:', error);
        dispatch({ type: 'SET_JOB_ERROR', payload: { id: taskId, error: message } });
        dispatch({ type: 'SET_ERROR', payload: message });
      }
    }, 2000);

    setPollingInterval(interval);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [pollingInterval]);

  const handleStartScraping = () => {
    const domainList = domains.split('\n').filter(d => d.trim());
    if (domainList.length === 0) {
      dispatch({ type: 'SET_ERROR', payload: 'Please enter at least one domain' });
      return;
    }

    startScrapingMutation.mutate({ domains: domainList });
  };

  const handleStopJob = () => {
    if (state.activeJob) {
      stopJobMutation.mutate(state.activeJob.id);
    }
  };

  // Calculate metrics
  const totalJobs = state.jobs.length;
  const runningJobs = state.jobs.filter(job => job.status === 'running').length;
  const completedJobs = state.jobs.filter(job => job.status === 'completed').length;
  const failedJobs = state.jobs.filter(job => job.status === 'failed').length;
  const successRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;

  // Chart data
  const performanceData = state.jobs.slice(-10).map((job, index) => ({
    name: `Job ${index + 1}`,
    success: job.progress?.success || 0,
    failed: job.progress?.failed || 0,
    total: job.progress?.total || 0,
  }));

  const statusData = [
    { name: 'Completed', value: completedJobs, color: '#00d4aa' },
    { name: 'Running', value: runningJobs, color: '#ff6b35' },
    { name: 'Failed', value: failedJobs, color: '#f44336' },
  ];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
          Scraping Dashboard
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Monitor and manage your web scraping operations in real-time
        </Typography>
      </Box>

      {/* Error Alert */}
      {state.error && (
        <Alert 
          severity="error" 
          sx={{ mb: 3 }}
          onClose={() => dispatch({ type: 'SET_ERROR', payload: null })}
        >
          {state.error}
        </Alert>
      )}

      {/* Metrics Cards */}
      <Box display="flex" flexWrap="wrap" gap={3} sx={{ mb: 4 }}>
        <Box flex={1} minWidth={250}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Total Jobs
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 600 }}>
                    {totalJobs}
                  </Typography>
                </Box>
                <TrendingUpIcon sx={{ fontSize: 40, color: 'primary.main' }} />
              </Box>
            </CardContent>
          </Card>
        </Box>

        <Box flex={1} minWidth={250}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Running
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 600, color: 'warning.main' }}>
                    {runningJobs}
                  </Typography>
                </Box>
                <SpeedIcon sx={{ fontSize: 40, color: 'warning.main' }} />
              </Box>
            </CardContent>
          </Card>
        </Box>

        <Box flex={1} minWidth={250}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Completed
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 600, color: 'success.main' }}>
                    {completedJobs}
                  </Typography>
                </Box>
                <CheckIcon sx={{ fontSize: 40, color: 'success.main' }} />
              </Box>
            </CardContent>
          </Card>
        </Box>

        <Box flex={1} minWidth={250}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Success Rate
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 600, color: 'primary.main' }}>
                    {successRate.toFixed(1)}%
                  </Typography>
                </Box>
                <TrendingUpIcon sx={{ fontSize: 40, color: 'primary.main' }} />
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Charts */}
      <Box display="flex" flexWrap="wrap" gap={3} sx={{ mb: 4 }}>
        <Box flex={2} minWidth={300}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Performance Trends
              </Typography>
              <Box sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="success" stroke="#00d4aa" strokeWidth={2} />
                    <Line type="monotone" dataKey="failed" stroke="#f44336" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Box>

        <Box flex={1} minWidth={250}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Job Status Distribution
              </Typography>
              <Box sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Active Job */}
      {state.activeJob && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Active Job: {state.activeJob.id}
            </Typography>
            {state.activeJob.error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {state.activeJob.error}
              </Alert>
            )}
            <Box sx={{ mb: 2 }}>
              {state.activeJob.domains.map((domain, index) => (
                <Chip
                  key={index}
                  label={domain}
                  icon={<DomainIcon />}
                  sx={{ mr: 1, mb: 1 }}
                />
              ))}
            </Box>
            {state.activeJob.progress && (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">
                    Progress: {state.activeJob.progress.completed} / {state.activeJob.progress.total}
                  </Typography>
                  <Typography variant="body2">
                    {state.activeJob.progress.percent}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={parseFloat(state.activeJob.progress.percent)}
                  sx={{ mb: 2 }}
                />
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Chip
                    label={`Success: ${state.activeJob.progress.success}`}
                    color="success"
                    size="small"
                  />
                  <Chip
                    label={`Failed: ${state.activeJob.progress.failed}`}
                    color="error"
                    size="small"
                  />
                </Box>
              </Box>
            )}
            <Box sx={{ mt: 2 }}>
              <Button
                variant="contained"
                color="error"
                startIcon={<StopIcon />}
                onClick={handleStopJob}
                disabled={stopJobMutation.isPending}
              >
                {stopJobMutation.isPending ? 'Stopping...' : 'Stop Job'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Recent Jobs */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Recent Jobs
          </Typography>
          <List>
              {state.jobs.slice(0, 5).map((job, index) => (
                <React.Fragment key={job.id}>
                  <ListItem>
                    <ListItemIcon>
                    {job.status === 'running' && <TimerIcon color="warning" />}
                    {job.status === 'completed' && <CheckIcon color="success" />}
                    {job.status === 'failed' && <ErrorIcon color="error" />}
                    {job.status === 'cancelled' && <StopIcon color="error" />}
                    </ListItemIcon>
                    <ListItemText
                      primary={`Job ${job.id.slice(0, 8)}...`}
                      secondary={`${job.domains.length} domains • ${job.status} • ${job.startTime.toLocaleString()}${job.error ? ' • Error: ' + job.error : ''}`}
                    />
                    <Chip
                      label={job.status}
                      color={
                        job.status === 'completed' ? 'success' :
                        job.status === 'running' ? 'warning' :
                        job.status === 'cancelled' ? 'default' : 'error'
                      }
                      size="small"
                    />
                  </ListItem>
                  {index < 4 && <Divider />}
                </React.Fragment>
              ))}
            {state.jobs.length === 0 && (
              <ListItem>
                <ListItemText
                  primary="No jobs yet"
                  secondary="Start your first scraping job to see it here"
                />
              </ListItem>
            )}
          </List>
        </CardContent>
      </Card>

      {/* Floating Action Button */}
      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={() => setNewJobDialog(true)}
      >
        <AddIcon />
      </Fab>

      {/* New Job Dialog */}
      <Dialog open={newJobDialog} onClose={() => setNewJobDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Start New Scraping Job</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter one domain per line to start a new scraping job.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Domains (one per line)"
            multiline
            rows={6}
            fullWidth
            variant="outlined"
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            placeholder="https://example1.com&#10;https://example2.com&#10;https://example3.com"
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewJobDialog(false)}>Cancel</Button>
          <Button
            onClick={handleStartScraping}
            variant="contained"
            disabled={startScrapingMutation.isPending}
            startIcon={<PlayIcon />}
          >
            {startScrapingMutation.isPending ? 'Starting...' : 'Start Scraping'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Dashboard;

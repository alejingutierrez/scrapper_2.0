import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Button,
  TextField,
  InputAdornment,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  LinearProgress,
  Tooltip,

  Paper,
} from '@mui/material';
import {
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { useScraping } from '../context/ScrapingContext';
import { ScrapingJob } from '../context/ScrapingContext';

const ScrapingJobs: React.FC = () => {
  const { state, dispatch } = useScraping();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedJob, setSelectedJob] = useState<ScrapingJob | null>(null);
  const [jobDetailsDialog, setJobDetailsDialog] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ element: HTMLElement; jobId: string } | null>(null);

  // Filter jobs based on search and status
  const filteredJobs = state.jobs.filter(job => {
    const matchesSearch = job.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         job.domains.some(domain => domain.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, jobId: string) => {
    setMenuAnchor({ element: event.currentTarget, jobId });
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleViewJob = (job: ScrapingJob) => {
    setSelectedJob(job);
    setJobDetailsDialog(true);
    handleMenuClose();
  };

  const handleDeleteJob = (jobId: string) => {
    // In a real app, you'd call an API to delete the job
    console.log('Delete job:', jobId);
    handleMenuClose();
  };

  const handleExportJob = (jobId: string) => {
    // In a real app, you'd call an API to export job results
    console.log('Export job:', jobId);
    handleMenuClose();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'running': return 'warning';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  const formatDuration = (startTime: Date, endTime?: Date) => {
    const end = endTime || new Date();
    const duration = end.getTime() - startTime.getTime();
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const calculateSuccessRate = (job: ScrapingJob) => {
    if (!job.progress || job.progress.total === 0) return 0;
    return (job.progress.success / job.progress.total) * 100;
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
          Scraping Jobs
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage and monitor all your scraping operations
        </Typography>
      </Box>

      {/* Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" flexWrap="wrap" gap={2} alignItems="center">
            <Box flex="1 1 300px" minWidth={300} maxWidth={{ md: '50%' }}>
              <TextField
                fullWidth
                placeholder="Search jobs by ID or domain..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>
            <Box flex="1 1 200px" minWidth={180} maxWidth={{ md: '25%' }}>
  <TextField
    select
    fullWidth
    label="Status Filter"
    value={statusFilter}
    onChange={(e) => setStatusFilter(e.target.value)}
    InputProps={{
      startAdornment: (
        <InputAdornment position="start">
          <FilterIcon />
        </InputAdornment>
      ),
    }}
  >
    <MenuItem value="all">All Status</MenuItem>
    <MenuItem value="running">Running</MenuItem>
    <MenuItem value="completed">Completed</MenuItem>
    <MenuItem value="failed">Failed</MenuItem>
    <MenuItem value="pending">Pending</MenuItem>
  </TextField>
</Box>
            <Box flex="1 1 200px" minWidth={180} maxWidth={{ md: '25%' }}>
  <Button
    fullWidth
    variant="outlined"
    startIcon={<RefreshIcon />}
    onClick={() => window.location.reload()}
  >
    Refresh
  </Button>
</Box>
          </Box>
        </CardContent>
      </Card>

      {/* Jobs Table */}
      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Job ID</TableCell>
                <TableCell>Domains</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Progress</TableCell>
                <TableCell>Success Rate</TableCell>
                <TableCell>Duration</TableCell>
                <TableCell>Started</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredJobs.map((job) => (
                <TableRow key={job.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {job.id.slice(0, 8)}...
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {job.domains.slice(0, 2).map((domain, index) => (
                        <Chip
                          key={index}
                          label={domain.replace('https://', '').replace('http://', '')}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                      {job.domains.length > 2 && (
                        <Chip
                          label={`+${job.domains.length - 2} more`}
                          size="small"
                          variant="outlined"
                          color="primary"
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={job.status}
                      color={getStatusColor(job.status) as any}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {job.progress ? (
                      <Box sx={{ minWidth: 120 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="caption">
                            {job.progress.completed}/{job.progress.total}
                          </Typography>
                          <Typography variant="caption">
                            {job.progress.percent}
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={parseFloat(job.progress.percent)}
                          sx={{ height: 4, borderRadius: 2 }}
                        />
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No data
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {job.progress ? `${calculateSuccessRate(job).toFixed(1)}%` : 'N/A'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {formatDuration(job.startTime, job.endTime)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {job.startTime.toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="More actions">
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuClick(e, job.id)}
                      >
                        <MoreVertIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {filteredJobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Box sx={{ py: 4 }}>
                      <Typography variant="body1" color="text.secondary">
                        No jobs found matching your criteria
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor?.element}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => {
          const job = state.jobs.find(j => j.id === menuAnchor?.jobId);
          if (job) handleViewJob(job);
        }}>
          <ViewIcon sx={{ mr: 1 }} />
          View Details
        </MenuItem>
        <MenuItem onClick={() => menuAnchor && handleExportJob(menuAnchor.jobId)}>
          <DownloadIcon sx={{ mr: 1 }} />
          Export Results
        </MenuItem>
        <MenuItem 
          onClick={() => menuAnchor && handleDeleteJob(menuAnchor.jobId)}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1 }} />
          Delete Job
        </MenuItem>
      </Menu>

      {/* Job Details Dialog */}
      <Dialog
        open={jobDetailsDialog}
        onClose={() => setJobDetailsDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Job Details: {selectedJob?.id.slice(0, 8)}...
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Detailed information about the selected scraping job.
          </DialogContentText>
          {selectedJob && (
            <Box sx={{ mt: 2 }}>
              <Box display="flex" flexWrap="wrap" gap={3}>
                <Box flex="1 1 300px" minWidth={300} maxWidth={{ md: '50%' }}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom>
                      Basic Information
                    </Typography>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        Job ID
                      </Typography>
                      <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                        {selectedJob.id}
                      </Typography>
                    </Box>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        Status
                      </Typography>
                      <Chip
                        label={selectedJob.status}
                        color={getStatusColor(selectedJob.status) as any}
                        size="small"
                      />
                    </Box>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        Started
                      </Typography>
                      <Typography variant="body1">
                        {selectedJob.startTime.toLocaleString()}
                      </Typography>
                    </Box>
                    {selectedJob.endTime && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          Completed
                        </Typography>
                        <Typography variant="body1">
                          {selectedJob.endTime.toLocaleString()}
                        </Typography>
                      </Box>
                    )}
                  </Paper>
                </Box>
                <Box flex="1 1 300px" minWidth={300} maxWidth={{ md: '50%' }}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom>
                      Progress & Results
                    </Typography>
                    {selectedJob.progress ? (
                      <Box>
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="body2" color="text.secondary">
                            Overall Progress
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={parseFloat(selectedJob.progress.percent)}
                            sx={{ mt: 1, height: 8, borderRadius: 4 }}
                          />
                          <Typography variant="body2" sx={{ mt: 1 }}>
                            {selectedJob.progress.completed} / {selectedJob.progress.total} URLs
                          </Typography>
                        </Box>
                        <Box display="flex" flexWrap="wrap" gap={2}>
                          <Box flex="1 1 45%" minWidth={120}>
                            <Box sx={{ textAlign: 'center' }}>
                              <Typography variant="h4" color="success.main">
                                {selectedJob.progress.success}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Successful
                              </Typography>
                            </Box>
                          </Box>
                          <Box flex="1 1 45%" minWidth={120}>
                            <Box sx={{ textAlign: 'center' }}>
                              <Typography variant="h4" color="error.main">
                                {selectedJob.progress.failed}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Failed
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No progress data available
                      </Typography>
                    )}
                  </Paper>
                </Box>
                <Box flex="1 1 100%" minWidth={200}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom>
                      Target Domains
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {selectedJob.domains.map((domain, index) => (
                        <Chip
                          key={index}
                          label={domain}
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </Paper>
                </Box>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJobDetailsDialog(false)}>
            Close
          </Button>
          <Button variant="contained" startIcon={<DownloadIcon />}>
            Export Results
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ScrapingJobs;

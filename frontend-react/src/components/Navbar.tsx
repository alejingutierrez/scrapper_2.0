import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Badge,
  Menu,
  MenuItem,
  Box,
  Chip,
  Avatar,
  Tooltip,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Work as WorkIcon,
  Analytics as AnalyticsIcon,
  Settings as SettingsIcon,
  Notifications as NotificationsIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  BugReport as BugIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useScraping } from '../context/ScrapingContext';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api';

const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useScraping();
  const [notificationAnchor, setNotificationAnchor] = useState<null | HTMLElement>(null);

  // Health check query
  const { data: healthData, isError: healthError } = useQuery({
    queryKey: ['health'],
    queryFn: apiService.healthCheck,
    refetchInterval: 30000, // Check every 30 seconds
    retry: 1,
  });

  const navigationItems = [
    { path: '/', label: 'Dashboard', icon: <DashboardIcon /> },
    { path: '/jobs', label: 'Jobs', icon: <WorkIcon /> },
    { path: '/analytics', label: 'Analytics', icon: <AnalyticsIcon /> },
    { path: '/settings', label: 'Settings', icon: <SettingsIcon /> },
  ];

  const handleNotificationClick = (event: React.MouseEvent<HTMLElement>) => {
    setNotificationAnchor(event.currentTarget);
  };

  const handleNotificationClose = () => {
    setNotificationAnchor(null);
  };

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
        {/* Logo and Title */}
        <Box sx={{ display: 'flex', alignItems: 'center', mr: 4 }}>
          <BugIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
            Scraper 2.0
          </Typography>
        </Box>

        {/* Navigation Items */}
        <Box sx={{ display: 'flex', gap: 1, flexGrow: 1 }}>
          {navigationItems.map((item) => (
            <Button
              key={item.path}
              startIcon={item.icon}
              onClick={() => navigate(item.path)}
              sx={{
                color: location.pathname === item.path ? 'primary.main' : 'text.secondary',
                backgroundColor: location.pathname === item.path ? 'rgba(0, 212, 170, 0.1)' : 'transparent',
                '&:hover': {
                  backgroundColor: 'rgba(0, 212, 170, 0.05)',
                },
              }}
            >
              {item.label}
            </Button>
          ))}
        </Box>

        {/* Status Indicators */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* System Status */}
          <Tooltip title={`System Status: ${getStatusText()}`}>
            <Chip
              label={getStatusText()}
              color={getStatusColor()}
              size="small"
              variant="outlined"
              sx={{ minWidth: 80 }}
            />
          </Tooltip>

          {/* Active Jobs Counter */}
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

          {/* Completed Jobs Counter */}
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

          {/* Failed Jobs Counter */}
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

          {/* Notifications */}
          <Tooltip title="Notifications">
            <IconButton
              color="inherit"
              onClick={handleNotificationClick}
              sx={{ color: 'text.secondary' }}
            >
              <Badge badgeContent={state.error ? 1 : 0} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* User Avatar */}
          <Avatar
            sx={{
              width: 32,
              height: 32,
              bgcolor: 'primary.main',
              fontSize: '0.875rem',
            }}
          >
            U
          </Avatar>
        </Box>

        {/* Notifications Menu */}
        <Menu
          anchorEl={notificationAnchor}
          open={Boolean(notificationAnchor)}
          onClose={handleNotificationClose}
          PaperProps={{
            sx: {
              mt: 1,
              minWidth: 300,
              maxWidth: 400,
            },
          }}
        >
          {state.error ? (
            <MenuItem onClick={handleNotificationClose}>
              <Box>
                <Typography variant="subtitle2" color="error">
                  System Error
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {state.error}
                </Typography>
              </Box>
            </MenuItem>
          ) : (
            <MenuItem onClick={handleNotificationClose}>
              <Typography variant="body2" color="text.secondary">
                No new notifications
              </Typography>
            </MenuItem>
          )}
        </Menu>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;

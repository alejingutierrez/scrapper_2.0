import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,

  TextField,
  Switch,
  FormControlLabel,
  Button,
  Divider,
  Alert,
  Slider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  Save as SaveIcon,
  Restore as RestoreIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Security as SecurityIcon,
  Speed as SpeedIcon,
  Storage as StorageIcon,
  Notifications as NotificationsIcon,
} from '@mui/icons-material';
import { useScraping } from '../context/ScrapingContext';

const Settings: React.FC = () => {
  const { state, dispatch } = useScraping();
  const [settings, setSettings] = useState(state.settings);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [resetDialog, setResetDialog] = useState(false);
  const [customHeaders, setCustomHeaders] = useState<Record<string, string>>({
    'User-Agent': 'Mozilla/5.0 (compatible; ScraperBot/2.0)',
  });
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');

  const handleSettingChange = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveSettings = () => {
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: settings,
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleResetSettings = () => {
    const defaultSettings = {
      maxConcurrentJobs: 3,
      retryAttempts: 2,
      timeout: 30000,
      autoRefresh: true,
    };
    setSettings(defaultSettings);
    setResetDialog(false);
  };

  const handleAddHeader = () => {
    if (newHeaderKey && newHeaderValue) {
      setCustomHeaders(prev => ({
        ...prev,
        [newHeaderKey]: newHeaderValue,
      }));
      setNewHeaderKey('');
      setNewHeaderValue('');
    }
  };

  const handleRemoveHeader = (key: string) => {
    setCustomHeaders(prev => {
      const newHeaders = { ...prev };
      delete newHeaders[key];
      return newHeaders;
    });
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
          Settings
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Configure your scraping environment and preferences
        </Typography>
      </Box>

      {/* Success Alert */}
      {saveSuccess && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Settings saved successfully!
        </Alert>
      )}

      <Box display="flex" flexWrap="wrap" gap={3}>
        {/* Performance Settings */}
        <Box flex="1 1 400px" minWidth={350} maxWidth={{ md: '50%' }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <SpeedIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6">Performance</Typography>
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography gutterBottom>
                  Max Concurrent Jobs: {settings.maxConcurrentJobs}
                </Typography>
                <Slider
                  value={settings.maxConcurrentJobs}
                  onChange={(_, value) => handleSettingChange('maxConcurrentJobs', value)}
                  min={1}
                  max={10}
                  marks
                  valueLabelDisplay="auto"
                />
                <Typography variant="caption" color="text.secondary">
                  Maximum number of jobs that can run simultaneously
                </Typography>
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography gutterBottom>
                  Retry Attempts: {settings.retryAttempts}
                </Typography>
                <Slider
                  value={settings.retryAttempts}
                  onChange={(_, value) => handleSettingChange('retryAttempts', value)}
                  min={0}
                  max={5}
                  marks
                  valueLabelDisplay="auto"
                />
                <Typography variant="caption" color="text.secondary">
                  Number of retry attempts for failed URLs
                </Typography>
              </Box>

              <Box sx={{ mb: 3 }}>
                <TextField
                  fullWidth
                  label="Request Timeout (ms)"
                  type="number"
                  value={settings.timeout}
                  onChange={(e) => handleSettingChange('timeout', parseInt(e.target.value))}
                  helperText="Timeout for individual HTTP requests"
                />
              </Box>

              <FormControlLabel
                control={
                  <Switch
                    checked={settings.autoRefresh}
                    onChange={(e) => handleSettingChange('autoRefresh', e.target.checked)}
                  />
                }
                label="Auto-refresh job status"
              />
            </CardContent>
          </Card>
        </Box>

        {/* Security & Headers */}
        <Box flex="1 1 400px" minWidth={350} maxWidth={{ md: '50%' }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <SecurityIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6">Security & Headers</Typography>
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Custom HTTP Headers
                </Typography>
                <Box sx={{ mb: 2 }}>
                  {Object.entries(customHeaders).map(([key, value]) => (
                    <Box key={key} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Chip
                        label={`${key}: ${value}`}
                        onDelete={() => handleRemoveHeader(key)}
                        sx={{ maxWidth: '100%' }}
                      />
                    </Box>
                  ))}
                </Box>
                <Box display="flex" flexWrap="wrap" gap={1}>
                  <Box sx={{ flex: 1 }}>
                    <TextField
                      size="small"
                      placeholder="Header name"
                      value={newHeaderKey}
                      onChange={(e) => setNewHeaderKey(e.target.value)}
                    />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <TextField
                      size="small"
                      placeholder="Header value"
                      value={newHeaderValue}
                      onChange={(e) => setNewHeaderValue(e.target.value)}
                    />
                  </Box>
                  <Box flex="1 1 15%" minWidth={60}>
                    <IconButton onClick={handleAddHeader} size="small">
                      <AddIcon />
                    </IconButton>
                  </Box>
                </Box>
              </Box>

              <Box sx={{ mb: 3 }}>
                <FormControl fullWidth>
                  <InputLabel>Rate Limiting</InputLabel>
                  <Select
                    value="moderate"
                    label="Rate Limiting"
                  >
                    <MenuItem value="none">None</MenuItem>
                    <MenuItem value="light">Light (10 req/sec)</MenuItem>
                    <MenuItem value="moderate">Moderate (5 req/sec)</MenuItem>
                    <MenuItem value="strict">Strict (1 req/sec)</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <FormControlLabel
                control={<Switch defaultChecked />}
                label="Respect robots.txt"
              />
              <FormControlLabel
                control={<Switch defaultChecked />}
                label="Use proxy rotation"
              />
            </CardContent>
          </Card>
        </Box>

        {/* Data Storage */}
        <Box flex="1 1 400px" minWidth={350} maxWidth={{ md: '50%' }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <StorageIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6">Data Storage</Typography>
              </Box>

              <Box sx={{ mb: 3 }}>
                <FormControl fullWidth>
                  <InputLabel>Output Format</InputLabel>
                  <Select
                    value="jsonl"
                    label="Output Format"
                  >
                    <MenuItem value="json">JSON</MenuItem>
                    <MenuItem value="jsonl">JSON Lines</MenuItem>
                    <MenuItem value="csv">CSV</MenuItem>
                    <MenuItem value="xlsx">Excel</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ mb: 3 }}>
                <TextField
                  fullWidth
                  label="Output Directory"
                  value="./results"
                  helperText="Directory where scraped data will be saved"
                />
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography gutterBottom>
                  Max File Size (MB): 100
                </Typography>
                <Slider
                  value={100}
                  min={10}
                  max={1000}
                  marks={[
                    { value: 10, label: '10MB' },
                    { value: 100, label: '100MB' },
                    { value: 500, label: '500MB' },
                    { value: 1000, label: '1GB' },
                  ]}
                  valueLabelDisplay="auto"
                />
              </Box>

              <FormControlLabel
                control={<Switch defaultChecked />}
                label="Compress output files"
              />
              <FormControlLabel
                control={<Switch />}
                label="Auto-backup results"
              />
            </CardContent>
          </Card>
        </Box>

        {/* Notifications */}
        <Box flex="1 1 400px" minWidth={350} maxWidth={{ md: '50%' }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <NotificationsIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6">Notifications</Typography>
              </Box>

              <Box sx={{ mb: 3 }}>
                <TextField
                  fullWidth
                  label="Email Notifications"
                  type="email"
                  placeholder="your-email@example.com"
                  helperText="Receive notifications about job completion"
                />
              </Box>

              <Box sx={{ mb: 3 }}>
                <TextField
                  fullWidth
                  label="Webhook URL"
                  placeholder="https://your-webhook-url.com"
                  helperText="POST notifications to this URL"
                />
              </Box>

              <FormControlLabel
                control={<Switch defaultChecked />}
                label="Job completion notifications"
              />
              <FormControlLabel
                control={<Switch />}
                label="Error notifications"
              />
              <FormControlLabel
                control={<Switch />}
                label="Daily summary reports"
              />
            </CardContent>
          </Card>
        </Box>

        {/* Advanced Settings */}
        <Box width="100%">
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Advanced Configuration
              </Typography>
              <Divider sx={{ mb: 3 }} />

              <Box display="flex" flexWrap="wrap" gap={3}>
                <Box flex="1 1 300px" minWidth={250} maxWidth={{ md: '33%' }}>
                  <TextField
                    fullWidth
                    label="Browser Pool Size"
                    type="number"
                    defaultValue={3}
                    helperText="Number of browser instances to maintain"
                  />
                </Box>
                <Box flex="1 1 300px" minWidth={250} maxWidth={{ md: '33%' }}>
                  <TextField
                    fullWidth
                    label="Page Load Timeout (s)"
                    type="number"
                    defaultValue={30}
                    helperText="Maximum time to wait for page load"
                  />
                </Box>
                <Box flex="1 1 300px" minWidth={250} maxWidth={{ md: '33%' }}>
                  <TextField
                    fullWidth
                    label="Memory Limit (MB)"
                    type="number"
                    defaultValue={2048}
                    helperText="Maximum memory usage per browser"
                  />
                </Box>
              </Box>

              <Box sx={{ mt: 3 }}>
                <FormControlLabel
                  control={<Switch />}
                  label="Enable JavaScript execution"
                />
                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label="Load images"
                />
                <FormControlLabel
                  control={<Switch />}
                  label="Enable CSS loading"
                />
                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label="Use headless mode"
                />
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Action Buttons */}
      <Box sx={{ mt: 4, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          startIcon={<RestoreIcon />}
          onClick={() => setResetDialog(true)}
        >
          Reset to Defaults
        </Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSaveSettings}
        >
          Save Settings
        </Button>
      </Box>

      {/* Reset Confirmation Dialog */}
      <Dialog open={resetDialog} onClose={() => setResetDialog(false)}>
        <DialogTitle>Reset Settings</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to reset all settings to their default values?
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetDialog(false)}>Cancel</Button>
          <Button onClick={handleResetSettings} color="error" variant="contained">
            Reset
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Settings;

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useScrapingContext } from '../context/ScrapingContext';

interface AnalyticsData {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalUrls: number;
  successfulUrls: number;
  failedUrls: number;
  avgDuration: number;
  domains: { name: string; count: number; successRate: number }[];
  timeline: { date: string; jobs: number; success: number; failed: number }[];
}

const Analytics: React.FC = () => {
  const { state } = useScrapingContext();
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    totalUrls: 0,
    successfulUrls: 0,
    failedUrls: 0,
    avgDuration: 0,
    domains: [],
    timeline: [],
  });
  const [timeRange, setTimeRange] = useState('7d');
  const [selectedDomain, setSelectedDomain] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange, selectedDomain]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      // Simulate API call - replace with actual API endpoint
      const mockData: AnalyticsData = {
        totalJobs: 45,
        completedJobs: 38,
        failedJobs: 7,
        totalUrls: 1250,
        successfulUrls: 1180,
        failedUrls: 70,
        avgDuration: 180000, // 3 minutes in ms
        domains: [
          { name: 'example.com', count: 25, successRate: 94.5 },
          { name: 'test.com', count: 15, successRate: 89.2 },
          { name: 'demo.com', count: 5, successRate: 96.8 },
        ],
        timeline: [
          { date: '2024-01-01', jobs: 5, success: 4, failed: 1 },
          { date: '2024-01-02', jobs: 8, success: 7, failed: 1 },
          { date: '2024-01-03', jobs: 12, success: 11, failed: 1 },
          { date: '2024-01-04', jobs: 6, success: 5, failed: 1 },
          { date: '2024-01-05', jobs: 9, success: 8, failed: 1 },
          { date: '2024-01-06', jobs: 3, success: 2, failed: 1 },
          { date: '2024-01-07', jobs: 2, success: 1, failed: 1 },
        ],
      };
      setAnalytics(mockData);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes.toFixed(1)}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes.toFixed(0)}m`;
  };

  const successRate = analytics.totalUrls > 0 
    ? (analytics.successfulUrls / analytics.totalUrls) * 100 
    : 0;

  const pieData = [
    { name: 'Successful', value: analytics.successfulUrls, color: '#00C49F' },
    { name: 'Failed', value: analytics.failedUrls, color: '#FF8042' },
  ];

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Typography>Loading analytics...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 600 }}>
        Analytics Dashboard
      </Typography>

      {/* Controls */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Box display="flex" gap={2} flexWrap="wrap">
            <Box flex={1} minWidth={200}>
              <FormControl fullWidth>
                <InputLabel>Time Range</InputLabel>
                <Select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  label="Time Range"
                >
                  <MenuItem value="24h">Last 24 Hours</MenuItem>
                  <MenuItem value="7d">Last 7 Days</MenuItem>
                  <MenuItem value="30d">Last 30 Days</MenuItem>
                  <MenuItem value="90d">Last 90 Days</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Box flex={1} minWidth={200}>
              <FormControl fullWidth>
                <InputLabel>Domain Filter</InputLabel>
                <Select
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  label="Domain Filter"
                >
                  <MenuItem value="all">All Domains</MenuItem>
                  <MenuItem value="example.com">example.com</MenuItem>
                  <MenuItem value="test.com">test.com</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <Box sx={{ mb: 4 }}>
        <Box display="flex" gap={2} flexWrap="wrap">
          <Box flex={1} minWidth={200}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  Total Jobs
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  {analytics.totalJobs}
                </Typography>
                <Typography variant="body2" color="success.main">
                  {analytics.completedJobs} completed
                </Typography>
              </CardContent>
            </Card>
          </Box>
          <Box flex={1} minWidth={200}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  Success Rate
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 600, color: 'primary.main' }}>
                  {successRate.toFixed(1)}%
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {analytics.successfulUrls} / {analytics.totalUrls} URLs
                </Typography>
              </CardContent>
            </Card>
          </Box>
          <Box flex={1} minWidth={200}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  Avg Duration
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  {formatDuration(analytics.avgDuration / 1000 / 60)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Per job
                </Typography>
              </CardContent>
            </Card>
          </Box>
          <Box flex={1} minWidth={200}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  Total URLs
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  {analytics.totalUrls.toLocaleString()}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Processed
                </Typography>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>

      {/* Charts */}
      <Box display="flex" gap={3} flexWrap="wrap" sx={{ mb: 4 }}>
        <Box flex={2} minWidth={400}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Job Timeline
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={analytics.timeline}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="jobs" stroke="#8884d8" name="Total Jobs" />
                  <Line type="monotone" dataKey="success" stroke="#82ca9d" name="Successful" />
                  <Line type="monotone" dataKey="failed" stroke="#ffc658" name="Failed" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Box>
        <Box flex={1} minWidth={300}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Success Distribution
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
  percent !== undefined ? `${name} ${(percent * 100).toFixed(0)}%` : name
}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Domain Analysis */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Domain Performance
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Domain</TableCell>
                  <TableCell align="right">Jobs Count</TableCell>
                  <TableCell align="right">Success Rate</TableCell>
                  <TableCell align="right">Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {analytics.domains.map((domain) => (
                  <TableRow key={domain.name}>
                    <TableCell component="th" scope="row">
                      {domain.name}
                    </TableCell>
                    <TableCell align="right">{domain.count}</TableCell>
                    <TableCell align="right">{domain.successRate.toFixed(1)}%</TableCell>
                    <TableCell align="right">
                      <Chip
                        label={domain.successRate > 90 ? 'Excellent' : domain.successRate > 80 ? 'Good' : 'Needs Attention'}
                        color={domain.successRate > 90 ? 'success' : domain.successRate > 80 ? 'primary' : 'warning'}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Analytics;

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import ScrapingJobs from './pages/ScrapingJobs';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import { ScrapingProvider } from './context/ScrapingContext';

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Create a modern dark theme
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00d4aa',
      light: '#4fffdf',
      dark: '#00a37c',
    },
    secondary: {
      main: '#ff6b35',
      light: '#ff9d6b',
      dark: '#c73e0a',
    },
    background: {
      default: '#0a0e1a',
      paper: '#1a1f2e',
    },
    text: {
      primary: '#ffffff',
      secondary: '#b0bec5',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 500,
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'linear-gradient(135deg, #1a1f2e 0%, #2d3748 100%)',
          border: '1px solid #2d3748',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ScrapingProvider>
          <Router>
            <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
              <Navbar />
              <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/jobs" element={<ScrapingJobs />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </Box>
            </Box>
          </Router>
        </ScrapingProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';
jest.mock('./services/api', () => ({ apiService: { healthCheck: jest.fn() } }));

test('renders scraper dashboard', () => {
  render(<App />);
  const heading = screen.getByText(/Web Scraper Dashboard/i);
  expect(heading).toBeInTheDocument();
});

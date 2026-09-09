import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, background: '#fee2e2', color: '#991b1b', margin: 20, borderRadius: 8, border: '1px solid #ef4444', zIndex: 9999, position: 'relative' }}>
          <h2 style={{ marginTop: 0 }}>💥 Crash no React (Runtime Error)</h2>
          <p style={{ fontWeight: 'bold' }}>{this.state.error && this.state.error.toString()}</p>
          <pre style={{ fontSize: 11, background: '#fff', padding: 12, overflowX: 'auto', borderRadius: 4, marginTop: 16 }}>
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children; 
  }
}

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Container, Navbar, Nav, Button, Modal, Form, Alert } from 'react-bootstrap';
import WaferMapVisualization from './WaferMapVisualization';
import { parseG85 } from './utils/g85Utils';
import { supabase } from './utils/supabaseClient';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import CryptoJS from 'crypto-js';
import jwt from 'jsonwebtoken';

// Mock data storage (in production, this would be a database)
const mockUsers = [
  { username: 'user1', password: 'password123', role: 'user' },
  { username: 'admin', password: 'admin123', role: 'admin' }
];

const mockLots = [
  {
    id: 1,
    filename: 'lot_001.g85',
    uploadedBy: 'user1',
    uploadDate: '2024-01-15',
    status: 'pending',
    mapData: null,
    defects: [
      { x: 10, y: 20, defectType: 'scratch', severity: 'minor' },
      { x: 45, y: 67, defectType: 'dent', severity: 'major' }
    ]
  },
  {
    id: 2,
    filename: 'lot_002.g85',
    uploadedBy: 'user1',
    uploadDate: '2024-01-16',
    status: 'approved',
    mapData: null,
    defects: [
      { x: 15, y: 25, defectType: 'scratch', severity: 'minor' }
    ]
  }
];

// G85 to Wafer Map Converter (updated for professional G85 data)
const convertG85ToWaferMap = (mapData) => {
  if (!mapData || !mapData.header) {
    return null;
  }

  // The mapData is already in the correct format, just return it
  return mapData;
};

const ADMIN_SECRET = 'admin123'; // <-- Set your admin secret here

// JWT secret for signing tokens (in production, keep this secret and secure)
const JWT_SECRET = 'secret1213';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [lots, setLots] = useState(mockLots);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedLot, setSelectedLot] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [uploadForm, setUploadForm] = useState({ file: null, description: '' });
  const [alert, setAlert] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [file, setFile] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerForm, setRegisterForm] = useState({ email: '', password: '', adminSecret: '' });
  const [registerMessage, setRegisterMessage] = useState('');

  // Registration handler (local auth)
  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setRegisterMessage('');
    // Check if user already exists
    const { data: existing, error: existingError } = await supabase.from('users').select('email').eq('email', registerForm.email).single();
    if (existing && existing.email) {
      setRegisterMessage('User already exists.');
      setLoading(false);
      return;
    }
    // Hash password with SHA256
    const hashedPassword = CryptoJS.SHA256(registerForm.password).toString();
    // Set role
    const role = registerForm.adminSecret === ADMIN_SECRET ? 'admin' : 'user';
    // Insert user
    const { error } = await supabase.from('users').insert([
      { email: registerForm.email, password: hashedPassword, role }
    ]);
    if (error) {
      setRegisterMessage(error.message);
      setLoading(false);
      return;
    }
    setRegisterMessage('Registration successful! You can now log in.');
    setLoading(false);
  };

  // Login handler (local auth)
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    // Fetch user
    const { data: userData, error } = await supabase.from('users').select('*').eq('email', email).single();
    if (error || !userData) {
      setMessage('Invalid email or password.');
      setLoading(false);
      return;
    }
    // Check password with SHA256
    const hashedInput = CryptoJS.SHA256(password).toString();
    if (hashedInput !== userData.password) {
      setMessage('Invalid email or password.');
      setLoading(false);
      return;
    }
    // Create JWT and store in localStorage
    const token = jwt.sign({ email: userData.email, role: userData.role }, JWT_SECRET, { expiresIn: '24h' });
    localStorage.setItem('token', token);
    setUser({ email: userData.email, role: userData.role });
    fetchFiles();
    setLoading(false);
  };

  // Handle file upload
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setMessage('');
    const fileName = `${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage.from('uploads').upload(fileName, file);
    if (error) {
      setMessage(error.message);
    } else {
      // Optionally, insert metadata into a table
      await supabase.from('file_metadata').insert([
        { filename: fileName, original_name: file.name, uploaded_by: user.email, status: 'pending' }
      ]);
      setMessage('File uploaded!');
      fetchFiles();
    }
    setLoading(false);
  };

  // Fetch files from Supabase table
  const fetchFiles = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('file_metadata').select('*').order('uploaded_at', { ascending: false });
    if (!error) setFiles(data);
    setLoading(false);
  };

  // On mount, check for token
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        setUser({ email: decoded.email, role: decoded.role });
        fetchFiles();
      } catch (e) {
        localStorage.removeItem('token');
      }
    }
  }, []);

  // Logout
  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const handleFileUpload = (e) => {
    e.preventDefault();
    if (!uploadForm.file) {
      setAlert({ type: 'warning', message: 'Please select a file!' });
      return;
    }

    const file = uploadForm.file;
    if (!file.name.toLowerCase().endsWith('.g85')) {
      setAlert({ type: 'danger', message: 'Please upload a G85 format file!' });
      return;
    }

    // Parse G85 file using the professional parser
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target.result;
        const mapData = parseG85(content);
        
        // Extract defect information for display
        const defects = [];
        for (const [coord, status] of mapData.dies) {
          if (status === "EF") {
            const [x, y] = coord.split(',').map(Number);
            defects.push({
              x: x,
              y: y,
              defectType: 'defect',
              severity: 'major'
            });
          }
        }

        const newLot = {
          id: Date.now(),
          filename: file.name,
          uploadedBy: user.email,
          uploadDate: new Date().toISOString().split('T')[0],
          status: 'pending',
          description: uploadForm.description,
          mapData: mapData,
          defects: defects
        };

        setLots([...lots, newLot]);
        setShowUploadModal(false);
        setUploadForm({ file: null, description: '' });
        setAlert({ type: 'success', message: 'G85 file uploaded and parsed successfully!' });
      } catch (error) {
        console.error('Error parsing G85 file:', error);
        setAlert({ type: 'danger', message: 'Error parsing G85 file. Please ensure it\'s a valid G85 XML format.' });
      }
    };
    reader.readAsText(file);
  };

  const handleApproval = async (lotId, status) => {
    // Update in Supabase
    await supabase.from('file_metadata').update({ status }).eq('id', lotId);
    // Refresh the list
    fetchFiles();
    setAlert({ type: 'success', message: `Lot ${status} successfully!` });
  };

  const openVisualizer = (lot) => {
    setSelectedLot(lot);
  };

  // Filter lots based on status
  const filteredLots = statusFilter === 'all' 
    ? lots 
    : lots.filter(lot => lot.status === statusFilter);

  const Dashboard = () => (
    <Container className="mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>CPE Defect Approval Dashboard</h2>
        {(currentUser?.role === 'user' || currentUser?.role === 'admin') && (
          <Button variant="primary" onClick={() => setShowUploadModal(true)}>
            Upload New Lot
          </Button>
        )}
      </div>

      {alert && (
        <Alert variant={alert.type} dismissible onClose={() => setAlert(null)}>
          {alert.message}
        </Alert>
      )}

      {/* Status Filter */}
      <div className="mb-4">
        <div className="d-flex align-items-center gap-2">
          <span className="text-muted">Filter by status:</span>
          <div className="btn-group" role="group">
            <Button
              variant={statusFilter === 'all' ? 'primary' : 'outline-secondary'}
              size="sm"
              onClick={() => setStatusFilter('all')}
            >
              All ({lots.length})
            </Button>
            <Button
              variant={statusFilter === 'pending' ? 'warning' : 'outline-warning'}
              size="sm"
              onClick={() => setStatusFilter('pending')}
            >
              Pending ({lots.filter(lot => lot.status === 'pending').length})
            </Button>
            <Button
              variant={statusFilter === 'approved' ? 'success' : 'outline-success'}
              size="sm"
              onClick={() => setStatusFilter('approved')}
            >
              Approved ({lots.filter(lot => lot.status === 'approved').length})
            </Button>
            <Button
              variant={statusFilter === 'rejected' ? 'danger' : 'outline-danger'}
              size="sm"
              onClick={() => setStatusFilter('rejected')}
            >
              Rejected ({lots.filter(lot => lot.status === 'rejected').length})
            </Button>
          </div>
        </div>
      </div>

      <div className="row">
        {filteredLots.map(lot => (
          <div key={lot.id} className="col-md-6 col-lg-4 mb-4">
            <div className="card">
              <div className="card-header d-flex justify-content-between align-items-center">
                <h6 className="mb-0 text-truncate me-2" style={{ maxWidth: '70%' }} title={lot.filename}>
                  {lot.filename}
                </h6>
                <span className={`badge bg-${
                  lot.status === 'pending' ? 'warning' : 
                  lot.status === 'approved' ? 'success' : 'danger'
                } flex-shrink-0`}>
                  {lot.status}
                </span>
              </div>
              <div className="card-body">
                <p><strong>Uploaded by:</strong> {lot.uploadedBy}</p>
                <p><strong>Date:</strong> {lot.uploadDate}</p>
                {lot.mapData && (
                  <>
                    <p><strong>Product ID:</strong> {lot.mapData.header.ProductId || 'N/A'}</p>
                    <p><strong>Lot ID:</strong> {lot.mapData.header.LotId || 'N/A'}</p>
                    <p><strong>Wafer Size:</strong> {lot.mapData.header.WaferSize || 'N/A'}</p>
                    <p><strong>Grid Size:</strong> {lot.mapData.header.Rows || 'N/A'} x {lot.mapData.header.Columns || 'N/A'}</p>
                  </>
                )}
                <p><strong>Defects found:</strong> {lot.defects.length}</p>
                {lot.description && (
                  <p><strong>Description:</strong> {lot.description}</p>
                )}
                
                {lot.defects.length > 0 && (
                  <div className="mt-3">
                    <h6>Defects:</h6>
                    <div className="table-responsive">
                      <table className="table table-sm">
                        <thead>
                          <tr>
                            <th>X</th>
                            <th>Y</th>
                            <th>Type</th>
                            <th>Severity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lot.defects.slice(0, 3).map((defect, index) => (
                            <tr key={index}>
                              <td>{defect.x}</td>
                              <td>{defect.y}</td>
                              <td>{defect.defectType}</td>
                              <td>
                                <span className={`badge bg-${
                                  defect.severity === 'major' ? 'danger' : 'warning'
                                }`}>
                                  {defect.severity}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {lot.defects.length > 3 && (
                            <tr>
                              <td colSpan="4" className="text-center">
                                +{lot.defects.length - 3} more defects
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="mt-3">
                  <Button 
                    variant="info" 
                    size="sm" 
                    className="me-2"
                    onClick={() => openVisualizer(lot)}
                  >
                    View Wafer Map
                  </Button>
                  
                  {currentUser?.role === 'admin' && lot.status === 'pending' && (
                    <>
                      <Button 
                        variant="success" 
                        size="sm" 
                        className="me-2"
                        onClick={() => handleApproval(lot.id, 'approved')}
                      >
                        Approve
                      </Button>
                      <Button 
                        variant="danger" 
                        size="sm"
                        onClick={() => handleApproval(lot.id, 'rejected')}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Wafer Map Visualization Section */}
      {selectedLot && selectedLot.mapData && (
        <div className="mt-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h3>Wafer Map: {selectedLot.filename}</h3>
            <Button variant="outline-secondary" size="sm" onClick={() => setSelectedLot(null)}>
              Close Map
            </Button>
          </div>
          <WaferMapVisualization mapData={selectedLot.mapData} />
        </div>
      )}
    </Container>
  );

  if (!user) {
    return (
      <div style={{ maxWidth: 400, margin: 'auto', padding: 20 }}>
        <h2>Login</h2>
        <form onSubmit={handleLogin}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required /><br />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required /><br />
          <button type="submit" disabled={loading}>Login</button>
        </form>
        <Button variant="link" onClick={() => setShowRegisterModal(true)}>Register</Button>
        {message && <p>{message}</p>}
        <Modal show={showRegisterModal} onHide={() => setShowRegisterModal(false)}>
          <Modal.Header closeButton>
            <Modal.Title>Register</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleRegister}>
              <Form.Group className="mb-3">
                <Form.Label>Email</Form.Label>
                <Form.Control
                  type="email"
                  value={registerForm.email}
                  onChange={e => setRegisterForm({ ...registerForm, email: e.target.value })}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Password</Form.Label>
                <Form.Control
                  type="password"
                  value={registerForm.password}
                  onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Admin Secret (optional)</Form.Label>
                <Form.Control
                  type="text"
                  value={registerForm.adminSecret}
                  onChange={e => setRegisterForm({ ...registerForm, adminSecret: e.target.value })}
                  placeholder="Enter admin secret if you have one"
                />
              </Form.Group>
              <Button type="submit" disabled={loading}>Register</Button>
            </Form>
            {registerMessage && <Alert variant={registerMessage.includes('successful') ? 'success' : 'danger'} className="mt-3">{registerMessage}</Alert>}
          </Modal.Body>
        </Modal>
      </div>
    );
  }

  return (
    <Router>
      <div className="App">
        <Navbar bg="dark" variant="dark" expand="lg">
          <Container>
            <Navbar.Brand>CPE Approval Dashboard</Navbar.Brand>
            <Navbar.Toggle aria-controls="basic-navbar-nav" />
            <Navbar.Collapse id="basic-navbar-nav">
              <Nav className="me-auto">
                <Nav.Link href="#home">Dashboard</Nav.Link>
              </Nav>
              <Nav>
                {currentUser ? (
                  <>
                    <Navbar.Text className="me-3">
                      Welcome, {currentUser.email} ({currentUser.role})
                    </Navbar.Text>
                    <Button variant="outline-light" onClick={handleLogout}>
                      Logout
                    </Button>
                  </>
                ) : (
                  <Button variant="outline-light" onClick={() => setShowLoginModal(true)}>
                    Login
                  </Button>
                )}
              </Nav>
            </Navbar.Collapse>
          </Container>
        </Navbar>

        <Routes>
          <Route 
            path="/" 
            element={currentUser ? <Dashboard /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/login" 
            element={currentUser ? <Navigate to="/" /> : <Dashboard />} 
          />
        </Routes>

        {/* Login Modal */}
        <Modal show={showLoginModal} onHide={() => setShowLoginModal(false)}>
          <Modal.Header closeButton>
            <Modal.Title>Login</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleLogin}>
              <Form.Group className="mb-3">
                <Form.Label>Email</Form.Label>
                <Form.Control
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Password</Form.Label>
                <Form.Control
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </Form.Group>
              <div className="d-flex justify-content-end">
                <Button variant="secondary" className="me-2" onClick={() => setShowLoginModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit">
                  Login
                </Button>
              </div>
            </Form>
          </Modal.Body>
        </Modal>

        {/* Upload Modal */}
        <Modal show={showUploadModal} onHide={() => setShowUploadModal(false)} size="lg">
          <Modal.Header closeButton>
            <Modal.Title>Upload G85 Lot File</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleFileUpload}>
              <Form.Group className="mb-3">
                <Form.Label>G85 File</Form.Label>
                <Form.Control
                  type="file"
                  accept=".g85"
                  onChange={(e) => setUploadForm({...uploadForm, file: e.target.files[0]})}
                  required
                />
                <Form.Text className="text-muted">
                  Please select a G85 XML format file containing wafer map data.
                </Form.Text>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Description (Optional)</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm({...uploadForm, description: e.target.value})}
                  placeholder="Add any additional notes about this lot..."
                />
              </Form.Group>
              <div className="d-flex justify-content-end">
                <Button variant="secondary" className="me-2" onClick={() => setShowUploadModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit">
                  Upload Lot
                </Button>
              </div>
            </Form>
          </Modal.Body>
        </Modal>


      </div>
    </Router>
  );
}

export default App;

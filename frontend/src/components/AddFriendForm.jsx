import React, { useState } from 'react';
import { fetchWithAuth } from '../utils/api';

const AddFriendForm = ({ onAdd }) => {
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;

    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetchWithAuth(`/api/friends`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.trim() }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to add friend');
      }
      
      onAdd();
      setUsername('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="add-friend-container">
      <h3>Track New Friend</h3>
      <form onSubmit={handleSubmit} className="add-friend-form">
        <input
          type="text"
          className="add-friend-input"
          placeholder="Roblox Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={isLoading}
        />
        <button type="submit" className="btn-primary" disabled={isLoading}>
          {isLoading ? 'Adding...' : 'Add Friend'}
        </button>
      </form>
      {error && <div style={{ color: '#ef4444', fontSize: '0.9rem' }}>{error}</div>}
    </div>
  );
};

export default AddFriendForm;

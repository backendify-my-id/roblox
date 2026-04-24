import React, { useState } from 'react';

const TargetSearchForm = ({ onSearch, isLoading }) => {
  const [username, setUsername] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || isLoading) return;
    await onSearch(username.trim());
    setUsername('');
  };

  return (
    <form onSubmit={handleSubmit} className="add-friend-form" style={{ marginBottom: '2rem' }}>
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Tambah target baru (Roblox Username)..."
        className="add-friend-input"
        disabled={isLoading}
      />
      <button type="submit" className="btn-primary" disabled={isLoading || !username.trim()}>
        {isLoading ? 'Syncing...' : '+ Track'}
      </button>
    </form>
  );
};

export default TargetSearchForm;

import React from 'react';
import { AdminPanelProvider } from '../admin/context/AdminPanelContext';
import { AdminToastProvider } from '../admin/context/AdminToastContext';
import AdminWorkspace from '../admin/components/AdminWorkspace';

const AdminPanel = () => (
  <AdminPanelProvider>
    <AdminToastProvider>
      <AdminWorkspace />
    </AdminToastProvider>
  </AdminPanelProvider>
);

export default AdminPanel;

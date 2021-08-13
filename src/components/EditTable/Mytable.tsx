import { Table } from 'antd';
import { ColumnsType } from 'antd/lib/table';
import React from 'react';

export default function Mytable() {
  const columns: ColumnsType<{ align: string }> = [
    {
      title: 'Account',
      dataIndex: 'account',
      align: 'center',
    },
    {
      title: 'Role',
      dataIndex: 'role',
    },
    {
      title: 'Status',
      dataIndex: 'status',
    },
    {
      title: 'Store access',
      dataIndex: 'Store access',
    },
    {
      title: 'Last active',
      dataIndex: 'Last active',
    },
    {
      title: 'Actions',
      dataIndex: 'actions',
    },
  ];

  return (
    <div>
      <Table columns={columns} />
    </div>
  );
}

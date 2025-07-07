import { Button, Form, Input, Modal, Space } from 'antd';
import type React from 'react';
import type { RecordingSession } from '../../../store';
import { generateDefaultSessionName } from '../utils';

interface SessionModalsProps {
  // Create modal
  // isCreateModalVisible: boolean;
  // setIsCreateModalVisible: (visible: boolean) => void;
  // onCreateSession: (values: { name: string; description?: string }) => void;
  // createForm: any;

  // Edit modal
  isEditModalVisible: boolean;
  setIsEditModalVisible: (visible: boolean) => void;
  onUpdateSession: (values: { name: string; description?: string }) => void;
  editForm: any;
  // editingSession: RecordingSession | null;
  setEditingSession: (session: RecordingSession | null) => void;
}

export const SessionModals: React.FC<SessionModalsProps> = ({
  isEditModalVisible,
  setIsEditModalVisible,
  onUpdateSession,
  editForm,
  setEditingSession,
}) => {
  return (
    <>
      {/* Edit Session Modal */}
      <Modal
        title="Edit Recording Session"
        open={isEditModalVisible}
        onCancel={() => {
          setIsEditModalVisible(false);
          setEditingSession(null);
          editForm.resetFields();
        }}
        footer={null}
        className="session-modal"
      >
        <Form form={editForm} layout="vertical" onFinish={onUpdateSession}>
          <Form.Item
            name="name"
            label="Session Name"
            rules={[{ required: true, message: 'Please enter a session name' }]}
          >
            <Input placeholder="Enter session name" />
          </Form.Item>
          <Form.Item name="description" label="Description (Optional)">
            <Input.TextArea placeholder="Enter session description" rows={3} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button
                onClick={() => {
                  setIsEditModalVisible(false);
                  setEditingSession(null);
                  editForm.resetFields();
                }}
              >
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                Update Session
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

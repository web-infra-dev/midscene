import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Form,
  Input,
  Select,
  Typography,
  message,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import './App.css';
import {
  EventRecorder,
  RecordTimeline,
  type RecordedEvent,
} from '@midscene/recorder';
import CanvasSelector from './components/canvas-selector';

const { Title } = Typography;
const { Option } = Select;
const { TextArea } = Input;

interface CanvasElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  clicked: boolean;
}

interface FormData {
  username: string;
  password: string;
  confirmPassword: string;
  email: string;
  phone?: string;
  gender?: string;
  birthday?: any;
  address?: string;
  agreement: boolean;
  horizontalScroll?: boolean;
  canvasElements: CanvasElement[];
}

const IS_DEBUG_MODE = window.location.search.includes('debug');

const App: React.FC = () => {
  const [form] = Form.useForm();
  const [optimizedEvents, setOptimizedEvents] = useState<RecordedEvent[]>([]);
  const [rawEventsCount, setRawEventsCount] = useState(0);
  const [mergedEventsCount, setMergedEventsCount] = useState(0);

  const eventRecorderRef = useRef<EventRecorder | null>(null);

  useEffect(() => {
    if (IS_DEBUG_MODE) {
      eventRecorderRef.current = new EventRecorder((event: RecordedEvent) => {
        setRawEventsCount((prev) => prev + 1);
        setOptimizedEvents((prev) => {
          const optimized = eventRecorderRef.current?.optimizeEvent(
            event,
            prev,
          );
          console.log('record', optimized);
          return optimized || prev;
        });
        setMergedEventsCount(optimizedEvents.length);
      }, 'test');
      eventRecorderRef.current.start();
    }
    return () => {
      if (IS_DEBUG_MODE) {
        if (eventRecorderRef.current) {
          eventRecorderRef.current.stop();
        }
      }
    };
  }, []);

  const onFinish = (values: FormData) => {
    if (values.password !== values.confirmPassword) {
      message.error('Password confirmation does not match!');
      return;
    }
    console.log('Form Data:', values);
    console.log('Optimized Events:', optimizedEvents);
    message.success('Registration successful!');
  };

  const onFinishFailed = (errorInfo: any) => {
    console.log('Failed:', errorInfo);
    message.error('Please check the form information!');
  };

  return (
    <div className="app-container">
      <Card className="form-card">
        <Title level={2} style={{ textAlign: 'center', marginBottom: 30 }}>
          User Registration
        </Title>

        <Form
          form={form}
          name="registration"
          layout="vertical"
          onFinish={onFinish}
          onFinishFailed={onFinishFailed}
          autoComplete="off"
          size="large"
        >
          <Form.Item
            label="Username"
            name="username"
            rules={[
              { required: true, message: 'Please enter username!' },
              { min: 3, message: 'Username must be at least 3 characters!' },
            ]}
          >
            <Input placeholder="Please enter username" />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[
              { required: true, message: 'Please enter password!' },
              { min: 6, message: 'Password must be at least 6 characters!' },
            ]}
          >
            <Input.Password placeholder="Please enter password" />
          </Form.Item>

          <Form.Item
            label="Confirm Password"
            name="confirmPassword"
            rules={[{ required: true, message: 'Please confirm password!' }]}
          >
            <Input.Password placeholder="Please enter password again" />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Please enter email!' },
              { type: 'email', message: 'Please enter a valid email address!' },
            ]}
          >
            <Input placeholder="Please enter email" />
          </Form.Item>

          <Form.Item
            label="Phone Number"
            name="phone"
            rules={[
              {
                pattern: /^1[3-9]\d{9}$/,
                message: 'Please enter a valid phone number!',
              },
            ]}
          >
            <Input placeholder="Please enter phone number" />
          </Form.Item>

          <Form.Item label="Gender" name="gender">
            <Select placeholder="Please select gender" allowClear>
              <Option value="male">Male</Option>
              <Option value="female">Female</Option>
              <Option value="other">Other</Option>
            </Select>
          </Form.Item>

          <Form.Item label="Birthday" name="birthday">
            <DatePicker
              placeholder="Please select birthday"
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
            />
          </Form.Item>

          <Form.Item label="Address" name="address">
            <TextArea
              rows={3}
              placeholder="Please enter detailed address"
              showCount
              maxLength={200}
            />
          </Form.Item>

          <Form.Item
            label="Hobbies (Canvas)"
            name="canvasElements"
            tooltip="Add input boxes and checkboxes on the canvas"
          >
            <CanvasSelector />
          </Form.Item>

          <div className="horizontal-scroll-container">
            <div className="horizontal-form-row">
              <Form.Item label="Company" name="company">
                <Input placeholder="Please enter company name" />
              </Form.Item>
              <Form.Item label="Position" name="position">
                <Input placeholder="Please enter position" />
              </Form.Item>
              <Form.Item label="Hobby" name="hobby">
                <Input placeholder="Please enter hobbies" />
              </Form.Item>
              <Form.Item label="Bio" name="bio">
                <Input placeholder="Please enter bio" />
              </Form.Item>
            </div>
          </div>

          <Form.Item
            name="agreement"
            valuePropName="checked"
            rules={[
              {
                required: true,
                message: 'Please agree to the user agreement!',
              },
            ]}
          >
            <Checkbox>
              I have read and agree to the
              <a href="#" style={{ marginLeft: 4 }}>
                User Agreement
              </a>
              and
              <a href="#" style={{ marginLeft: 4 }}>
                Privacy Policy
              </a>
            </Checkbox>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              Register
            </Button>
          </Form.Item>
        </Form>

        <div
          className="rr-ignore"
          style={{
            marginTop: 20,
            fontSize: 12,
            color: '#666',
            padding: '10px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
          }}
        >
          <p style={{ margin: '4px 0' }}>📊 Recording Statistics</p>
          <p style={{ margin: '4px 0' }}>Raw Events: {rawEventsCount}</p>
          <p style={{ margin: '4px 0' }}>
            Optimized Events: {mergedEventsCount}
          </p>
          <p style={{ margin: '4px 0', fontSize: '10px', color: '#999' }}>
            Optimization Rate:{' '}
            {rawEventsCount > 0
              ? Math.round((1 - mergedEventsCount / rawEventsCount) * 100)
              : 0}
            %
          </p>
        </div>
      </Card>
      {IS_DEBUG_MODE && <RecordTimeline events={optimizedEvents} />}
    </div>
  );
};

export default App;

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
} from '@midscene/record';
import CanvasSelector from './components/CanvasSelector';

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
  const [optimizedEvents, setOptimizedEvents] = useState<RecordedEvent[]>([
    {
      type: 'navigation',
      url: window.location.href,
      timestamp: Date.now(),
      pageWidth: window.innerWidth,
      pageHeight: window.innerHeight,
    },
  ]);
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
      });
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
      message.error('两次输入的密码不一致！');
      return;
    }
    console.log('Form Data:', values);
    console.log('Optimized Events:', optimizedEvents);
    message.success('注册成功！');
  };

  const onFinishFailed = (errorInfo: any) => {
    console.log('Failed:', errorInfo);
    message.error('请检查表单信息！');
  };

  return (
    <div className="app-container">
      <Card className="form-card">
        <Title level={2} style={{ textAlign: 'center', marginBottom: 30 }}>
          用户注册
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
            label="用户名"
            name="username"
            rules={[
              { required: true, message: '请输入用户名!' },
              { min: 3, message: '用户名至少3个字符!' },
            ]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: '请输入密码!' },
              { min: 6, message: '密码至少6个字符!' },
            ]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>

          <Form.Item
            label="确认密码"
            name="confirmPassword"
            rules={[{ required: true, message: '请确认密码!' }]}
          >
            <Input.Password placeholder="请再次输入密码" />
          </Form.Item>

          <Form.Item
            label="电子邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入电子邮箱!' },
              { type: 'email', message: '请输入有效的邮箱地址!' },
            ]}
          >
            <Input placeholder="请输入电子邮箱" />
          </Form.Item>

          <Form.Item
            label="手机号码"
            name="phone"
            rules={[
              { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号码!' },
            ]}
          >
            <Input placeholder="请输入手机号码" />
          </Form.Item>

          <Form.Item label="性别" name="gender">
            <Select placeholder="请选择性别" allowClear>
              <Option value="male">男</Option>
              <Option value="female">女</Option>
              <Option value="other">其他</Option>
            </Select>
          </Form.Item>

          <Form.Item label="出生日期" name="birthday">
            <DatePicker
              placeholder="请选择出生日期"
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
            />
          </Form.Item>

          <Form.Item label="地址" name="address">
            <TextArea
              rows={3}
              placeholder="请输入详细地址"
              showCount
              maxLength={200}
            />
          </Form.Item>

          <Form.Item
            label="兴趣爱好（画布）"
            name="canvasElements"
            tooltip="在画布上添加输入框和复选框"
          >
            <CanvasSelector />
          </Form.Item>

          <div className="horizontal-scroll-container">
            <div className="horizontal-form-row">
              <Form.Item label="公司" name="company">
                <Input placeholder="请输入公司名称" />
              </Form.Item>
              <Form.Item label="职位" name="position">
                <Input placeholder="请输入职位" />
              </Form.Item>
              <Form.Item label="兴趣" name="hobby">
                <Input placeholder="请输入兴趣爱好" />
              </Form.Item>
              <Form.Item label="个人简介" name="bio">
                <Input placeholder="请输入个人简介" />
              </Form.Item>
            </div>
          </div>

          <Form.Item
            name="agreement"
            valuePropName="checked"
            rules={[{ required: true, message: '请同意用户协议!' }]}
          >
            <Checkbox>
              我已阅读并同意
              <a href="#" style={{ marginLeft: 4 }}>
                用户协议
              </a>
              和
              <a href="#" style={{ marginLeft: 4 }}>
                隐私政策
              </a>
            </Checkbox>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              注册
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
          <p style={{ margin: '4px 0' }}>📊 录制统计</p>
          <p style={{ margin: '4px 0' }}>原始事件: {rawEventsCount}</p>
          <p style={{ margin: '4px 0' }}>优化后事件: {mergedEventsCount}</p>
          <p style={{ margin: '4px 0', fontSize: '10px', color: '#999' }}>
            优化率:{' '}
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

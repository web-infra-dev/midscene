import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Form,
  Input,
  Select,
  Typography,
  message
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import './App.css';
import { EventOptimizer } from './EventOptimizer';
import { EventRecorder, type RecordedEvent } from './EventRecorder';

const { Title } = Typography;
const { Option } = Select;
const { TextArea } = Input;

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
}

const App: React.FC = () => {
  const [form] = Form.useForm();
  const [transformedEvents, setTransformedEvents] = useState<RecordedEvent[]>([]);
  const [mergedEventsCount, setMergedEventsCount] = useState(0);

  const eventRecorderRef = useRef<EventRecorder | null>(null);
  const eventOptimizerRef = useRef<EventOptimizer | null>(null);

  useEffect(() => {
    // 创建事件优化器
    eventOptimizerRef.current = new EventOptimizer();

    // 创建事件记录器
    eventRecorderRef.current = new EventRecorder((event: RecordedEvent) => {
      if (eventOptimizerRef.current) {
        const optimizedEvents = eventOptimizerRef.current.addEvent(event);
        setTransformedEvents(optimizedEvents);
        console.log('All Events:', optimizedEvents);
      }
    });

    // 开始记录
    eventRecorderRef.current.start();

    return () => {
      // 停止记录
      if (eventRecorderRef.current) {
        eventRecorderRef.current.stop();
      }
    };
  }, []);

  const onFinish = (values: FormData) => {
    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致！');
      return;
    }

    console.log('Form Data:', values);
    console.log('Recorded Events:', transformedEvents);

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
            htmlFor="null"
            name="username"
            rules={[
              { required: true, message: '请输入用户名!' },
              { min: 3, message: '用户名至少3个字符!' }
            ]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: '请输入密码!' },
              { min: 6, message: '密码至少6个字符!' }
            ]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>

          <Form.Item
            label="确认密码"
            name="confirmPassword"
            rules={[
              { required: true, message: '请确认密码!' }
            ]}
          >
            <Input.Password placeholder="请再次输入密码" />
          </Form.Item>

          <Form.Item
            label="电子邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入电子邮箱!' },
              { type: 'email', message: '请输入有效的邮箱地址!' }
            ]}
          >
            <Input placeholder="请输入电子邮箱" />
          </Form.Item>

          <Form.Item
            label="手机号码"
            name="phone"
            rules={[
              { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号码!' }
            ]}
          >
            <Input placeholder="请输入手机号码" />
          </Form.Item>

          <Form.Item
            label="性别"
            name="gender"
          >
            <Select placeholder="请选择性别" allowClear>
              <Option value="male">男</Option>
              <Option value="female">女</Option>
              <Option value="other">其他</Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="出生日期"
            name="birthday"
          >
            <DatePicker
              placeholder="请选择出生日期"
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
            />
          </Form.Item>

          <Form.Item
            label="地址"
            name="address"
          >
            <TextArea
              rows={3}
              placeholder="请输入详细地址"
              showCount
              maxLength={200}
            />
          </Form.Item>

          <Form.Item
            name="agreement"
            valuePropName="checked"
            rules={[
              { required: true, message: '请同意用户协议!' }
            ]}
          >
            <Checkbox>
              我已阅读并同意
              <a href="#" style={{ marginLeft: 4 }}>用户协议</a>
              和
              <a href="#" style={{ marginLeft: 4 }}>隐私政策</a>
            </Checkbox>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              注册
            </Button>
          </Form.Item>
        </Form>

        <div className="rr-ignore" style={{ marginTop: 20, fontSize: 12, color: '#666', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
          <p style={{ margin: '4px 0' }}>📊 录制统计</p>
          <p style={{ margin: '4px 0' }}>记录事件: {transformedEvents.length}</p>
          <p style={{ margin: '4px 0' }}>🔄 合并事件: {mergedEventsCount}</p>
          <p style={{ margin: '4px 0', fontSize: '10px', color: '#999' }}>
            优化率: {transformedEvents.length > 0 ? Math.round((mergedEventsCount / transformedEvents.length) * 100) : 0}%
          </p>
        </div>
      </Card>
    </div>
  );
};

export default App;

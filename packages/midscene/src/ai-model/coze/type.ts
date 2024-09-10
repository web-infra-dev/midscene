// doc url of coze: https://www.coze.com/docs/developer_guides/create_bot?_lang=en#ba8bf1e6
import type stream from 'node:stream';

export enum RequestType {
  GET = 'GET',
  POST = 'POST',
}

export interface RequestOfCreateBotType {
  space_id: string;
  name: string;
  description?: string;
  icon_file_id?: string;
  prompt_info?: {
    prompt?: string;
  };
  onboarding_info?: {
    prologue?: string;
    suggested_questions?: Array<string>;
  };
}

export interface ResponseOfCreateBotType {
  code: number; // 0 is success, every thing else is failure
  msg: string;
  data: {
    bot_id: string;
  };
}

export interface RequestOfUpdateBotType {
  bot_id: string;
  name: string;
  description: string;
  icon_file_id?: string;
  prompt_info?: {
    prompt?: string;
  };
  onboarding_info?: {
    prologue?: string;
    suggested_questions?: Array<string>;
  };
}

export interface ResponseOfUpdateBotType {
  code: number; // 0 is success, every thing else is failure
  msg: string;
}

export interface RequestOfGetBotListType {
  space_id: string;
  page_size?: number;
  page_index?: number;
}

export interface ResponseOfGetBotListType {
  code: number;
  msg: string;
  data: {
    space_bots: Array<{
      bot_id: string;
      name: string;
      description: string;
      icon_url: string;
      publish_time: string;
    }>;
    total: number;
  };
}

export interface RequestOfPublishBotType {
  bot_id: string;
  connector_ids: Array<string>;
}

export interface ResponseOfPublishBotType {
  code: number;
  msg: string;
  data: {
    bot_id: string;
    version: string;
  };
}

export interface RequestOfCozeChatType {
  bot_id: string;
  user_id: string;
  additional_messages?: Array<{
    role: string;
    type:
      | 'question'
      | 'answer'
      | 'function_call'
      | 'tool_output'
      | 'tool_response'
      | 'follow_up'
      | 'verbose';
    content: string;
    content_type: 'text' | 'object_string'; // content need to be struct string when content_type is object_string. Search details in doc.
    meta_data: Record<string, unknown>;
  }>;
  stream?: boolean; // default is false
  custom_variables?: Record<string, string>; // use this variable to reuse bot coze
  auto_save_history?: boolean;
  meta_data?: Record<string, unknown>;
}

export interface ObjectContentType {
  type: 'text' | 'file' | 'image';
  text?: string; // required when type is text
  file_id?: string;
  file_url?: string;
}

export interface ResponseOfCozeChatType {
  data: {
    id: string;
    conversation_id: string;
    bot_id: string;
    status: string;
    created_at?: number;
    completed_at?: number;
    failed_at?: number;
    meta_data?: Record<string, string>;
    last_error?: {
      code: number;
      message: string;
    };
    usage: {
      token_count: number;
      output_count: number;
      input_count: number;
    };
  };
  code: number;
  message: string;
}

export interface RequestOfGetCozeChatStatusType {
  conversation_id: string;
  chat_id: string;
}

export interface ResponseOfGetCozeChatStatusType {
  data: {
    id: string;
    conversation_id: string;
    bot_id: string;
    created_at?: number;
    completed_at?: number;
    failed_at?: number;
    meta_data?: Record<string, string>;
    last_error?: {
      code: string;
      msg: string;
    };
    status: string;
    usage: {
      token_count: number;
      output_count: number;
      input_count: number;
    };
  };
  code: number;
  msg: string;
}

export interface RequestOfGetCozeChatResultType {
  conversation_id: string;
  chat_id: string;
}

export interface ResponseOfGetCozeChatResultType {
  code: number;
  msg: string;
  data: {
    id: string;
    conversation_id: string;
    bot_id: string;
    chat_id: string;
    meta_data: Record<string, unknown>;
    role: 'user' | 'assistant';
    content: string;
    content_type: 'text' | 'object_string' | 'card';
    created_at: number;
    updated_at: number;
    type:
      | 'question'
      | 'answer'
      | 'function_call'
      | 'tool_output'
      | 'tool_response'
      | 'follow_up'
      | 'verbose';
  };
}

export type RequestOfUploadFileToCozeType = stream.Readable;

export interface ResponseOfUploadFileToCozeType {
  code: number;
  msg: string;
  data: {
    id: string;
    bytes: number;
    created_at: number;
    file_name: string;
  };
}

export type CozeRequestUnionType =
  | RequestOfCreateBotType
  | RequestOfGetBotListType
  | RequestOfPublishBotType
  | RequestOfUpdateBotType
  | RequestOfCozeChatType
  | RequestOfGetCozeChatStatusType
  | RequestOfGetCozeChatResultType
  | RequestOfUploadFileToCozeType;

export type CozeResponseUnionType =
  | ResponseOfCreateBotType
  | ResponseOfGetBotListType
  | ResponseOfPublishBotType
  | ResponseOfUpdateBotType
  | ResponseOfCozeChatType
  | ResponseOfGetCozeChatStatusType
  | ResponseOfGetCozeChatResultType
  | ResponseOfUploadFileToCozeType;

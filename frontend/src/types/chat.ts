export type Attachment = {
  id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  nonce: string;
  algo: string;
};

export type Message = {
  id: number;
  content: string | null;
  content_type?: string;
  sender?: { id: number; username: string };
  timestamp?: string;
  attachment?: Attachment | null;
};



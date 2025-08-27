import { ChatView } from "./ChatView";

type Props = {
  token: string;
  onLogout: () => void;
};

export function AuthenticatedApp({ token, onLogout }: Props) {
  return <ChatView token={token} onLogout={onLogout} />;
}



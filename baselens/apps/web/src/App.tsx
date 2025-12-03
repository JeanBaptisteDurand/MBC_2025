import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./routes/Home";
import GraphView from "./routes/GraphView";
import History from "./routes/History";
import Chat from "./routes/Chat";
import Profile from "./routes/Profile";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="graph/:analysisId" element={<GraphView />} />
		<Route path="chat" element={<Chat />} />
        <Route path="history" element={<History />} />
        <Route path="profile" element={<Profile />} />
      </Route>
    </Routes>
  );
}

export default App;


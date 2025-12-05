import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./routes/Home";
import GraphView from "./routes/GraphView";
import History from "./routes/History";
import Chat from "./routes/Chat";
import Analyze from "./routes/Analyze";
import Profile from "./routes/Profile";
import Mbc from "./routes/Mbc";
import Team from "./routes/Team";

function App() {
  return (
    <Routes>
      {/* MBC page without layout */}
      <Route path="/mbc" element={<Mbc />} />
      
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
		<Route path="analyze" element={<Analyze />} />
        <Route path="graph/:analysisId" element={<GraphView />} />
		<Route path="chat" element={<Chat />} />
        <Route path="history" element={<History />} />
        <Route path="profile" element={<Profile />} />
        <Route path="team" element={<Team />} />
      </Route>
    </Routes>
  );
}

export default App;


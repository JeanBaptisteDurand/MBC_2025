import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./routes/Home";
import GraphView from "./routes/GraphView";
import History from "./routes/History";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="graph/:analysisId" element={<GraphView />} />
        <Route path="history" element={<History />} />
      </Route>
    </Routes>
  );
}

export default App;


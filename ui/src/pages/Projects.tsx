import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useProjects } from "@/hooks/useProjects";
import {
  Search,
  Play,
  Square,
  RefreshCw,
  Trash2,
  ExternalLink,
  Info,
  ArrowLeft,
  Filter,
  FilePlus,
  UploadCloud,
} from "lucide-react";
import { getProjectUrl } from '@/utils/url';
import { UpdateProjectModal } from "@/components/UpdateProjectModal";

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { projects, startProject, stopProject, deleteProject } = useProjects();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "stopped" | "building">("all");

  // Initialize selected project from localStorage, fallback to first project
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const saved = localStorage.getItem('selectedProjectId');
    if (saved && projects.some(p => p.id === saved)) {
      return saved;
    }
    return projects[0]?.id || null;
  });

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  // Persist selected project to localStorage
  useEffect(() => {
    if (selectedId) {
      localStorage.setItem('selectedProjectId', selectedId);
    }
  }, [selectedId]);

  // Validate selectedId when projects change (e.g., project deleted)
  useEffect(() => {
    if (selectedId && !projects.some(p => p.id === selectedId)) {
      const newId = projects[0]?.id || null;
      setSelectedId(newId);
      if (newId) {
        localStorage.setItem('selectedProjectId', newId);
      } else {
        localStorage.removeItem('selectedProjectId');
      }
    } else if (!selectedId && projects.length > 0) {
      // If no selection but projects exist, select first project
      const newId = projects[0].id;
      setSelectedId(newId);
      localStorage.setItem('selectedProjectId', newId);
    }
  }, [projects, selectedId]);

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      (project.name?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (project.domain?.toLowerCase() || "").includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const selectedProject = projects.find((p) => p.id === selectedId);

  const getRuntimeLabel = (runtime: string) => {
    switch (runtime) {
      case "react":
        return "React";
      case "nextjs":
        return "Next.js";
      case "nodejs":
        return "Node.js";
      default:
        return runtime;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="px-8 pt-2 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button className="p-2 rounded-pill bg-zinc-900 border border-zinc-800 hover:bg-zinc-800">
              <ArrowLeft className="w-5 h-5 text-zinc-400" />
            </button>
            <h1 className="text-4xl font-light text-foreground">Projects</h1>
          </div>
          <div className="flex items-center space-x-3">
            <button className="p-3 rounded-pill bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-foreground">
              <Filter className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate("/deploy")}
              className="flex items-center space-x-2 px-5 py-3 rounded-pill border border-zinc-700 text-foreground bg-transparent hover:bg-zinc-900"
            >
              <FilePlus className="w-5 h-5" />
              <span>Create project</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4 overflow-x-auto">
            <div className="flex items-center space-x-2 text-foreground">
              <span className="font-medium">Active filters</span>
              <Info className="w-4 h-4 text-zinc-500" />
            </div>

            <div className="h-6 w-px bg-zinc-800 mx-2"></div>

            {(["all", "running", "stopped", "building"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-pill text-sm transition-colors ${statusFilter === status
                  ? "bg-neon text-primary-foreground font-medium"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-foreground hover:border-zinc-700"
                  }`}
              >
                <span>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                {statusFilter === status && <div className="w-1.5 h-1.5 bg-black rounded-pill"></div>}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="bg-zinc-900 border border-zinc-800 text-foreground pl-10 pr-4 py-2 rounded-pill text-sm focus:outline-none focus:border-zinc-600 w-64"
            />
          </div>
        </div>

        {/* Main Content - White Container with Split View */}
        <div className="px-8 pb-8">
          <div className="bg-panel rounded-panel p-2 flex flex-col md:flex-row overflow-hidden shadow-2xl min-h-[500px]">
            {/* Left Column: List */}
            <div className="w-full md:w-5/12 flex flex-col border-r border-gray-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-medium text-panel-foreground">All Projects</h2>
                <div className="flex items-center space-x-1 bg-black border border-zinc-800 p-1 rounded-pill">
                  <button className="px-3 py-1 text-xs font-medium text-zinc-400 hover:text-white transition-colors rounded-pill">
                    All
                  </button>
                  <div className="flex items-center px-3 py-1 space-x-1 text-zinc-400">
                    <span className="text-xs font-medium">Draft</span>
                    <span className="bg-zinc-800 text-zinc-300 text-[10px] font-bold px-1.5 py-0.5 rounded-pill">
                      {projects.filter((p) => p.status === "building").length}
                    </span>
                  </div>
                  <button className="px-3 py-1 text-xs font-medium bg-neon text-primary-foreground rounded-pill shadow-sm flex items-center space-x-1">
                    <span>Active</span>
                    <div className="w-1.5 h-1.5 bg-black rounded-pill"></div>
                  </button>
                </div>
              </div>

              <div className="flex-1 p-2 overflow-y-auto space-y-2 pr-2">
                {filteredProjects.map((project) => {
                  const isSelected = project.id === selectedId;
                  return (
                    <div
                      key={project.id}
                      onClick={() => setSelectedId(project.id)}
                      className={`flex items-center justify-between p-4 rounded-[1.5rem] cursor-pointer transition-all duration-200 ${isSelected
                        ? "bg-black text-white shadow-xl scale-[1.02] z-10"
                        : "bg-zinc-50 text-panel-foreground hover:bg-zinc-100 border border-transparent hover:border-zinc-200"
                        }`}
                    >
                      <div className="flex items-center space-x-4">
                        <div
                          className={`w-10 h-10 rounded-pill flex items-center justify-center ${isSelected ? "bg-zinc-800" : "bg-zinc-200"}`}
                        >
                          <span className={`text-sm font-bold ${isSelected ? "text-white" : "text-zinc-600"}`}>
                            {(project.name || "?").charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className={`font-medium text-sm ${isSelected ? "text-white" : "text-zinc-900"}`}>
                            {project.name}
                          </p>
                          <p className={`text-xs ${isSelected ? "text-zinc-400" : "text-zinc-500"}`}>
                            {project.domain}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div
                          className={`text-xs px-3 py-1.5 rounded-pill border transition-colors font-medium ${isSelected
                            ? "bg-zinc-800 border-zinc-700 text-zinc-300"
                            : "bg-panel border-zinc-200 text-zinc-700 shadow-sm"
                            }`}
                        >
                          {project.status}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Detail */}
            {selectedProject && (
              <div className="w-full md:w-7/12 p-4">
                <div className="bg-zinc-900 rounded-panel h-full p-8 text-white flex flex-col relative shadow-inner border border-zinc-800">
                  {/* Header */}
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <p className="text-zinc-500 text-sm mb-1">Project details</p>
                      <div className="flex items-center space-x-3">
                        <h2 className="text-3xl font-light">{selectedProject.name}</h2>
                        <span className="px-3 py-1 rounded-pill border border-zinc-700 text-zinc-400 text-xs">
                          {selectedProject.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => navigate(`/projects/${selectedProject.id}`)}
                        className="p-2 rounded-pill border border-zinc-700 hover:bg-zinc-800 text-zinc-400"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button className="p-2 rounded-pill border border-zinc-700 hover:bg-zinc-800 text-zinc-400">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Runtime & Domain */}
                  <div className="flex justify-between items-center mb-10">
                    <div>
                      <p className="text-zinc-500 text-sm mb-1">Runtime</p>
                      <h3 className="text-xl font-medium">{getRuntimeLabel(selectedProject.runtime)}</h3>
                    </div>
                    <div className="text-right">
                      <p className="text-zinc-500 text-sm mb-1">Domain</p>
                      <a
                        href={getProjectUrl(selectedProject)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium hover:text-neon transition-colors flex items-center gap-1 justify-end"
                      >
                        {getProjectUrl(selectedProject).replace(/^https?:\/\//, '')}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  {/* Resource Grid */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-zinc-800/50 p-4 rounded-card flex justify-between items-end border border-zinc-800">
                      <span className="text-zinc-400 text-sm">CPU Usage</span>
                      <span className="text-white text-lg font-light">
                        {selectedProject.runtime === 'react' ? (
                          <span className="text-zinc-500 text-sm" title="Static site served directly via Caddy">N/A</span>
                        ) : (
                          `${selectedProject.cpu || 0}%`
                        )}
                      </span>
                    </div>
                    <div className="bg-zinc-800/50 p-4 rounded-card flex justify-between items-end border border-zinc-800">
                      <span className="text-zinc-400 text-sm">Memory</span>
                      <span className="text-white text-lg font-light">
                        {selectedProject.runtime === 'react' ? (
                          <span className="text-zinc-500 text-sm" title="Static site served directly via Caddy">N/A</span>
                        ) : (
                          `${selectedProject.memory || 0} MB`
                        )}
                      </span>
                    </div>
                    <div className="bg-zinc-800/50 p-4 rounded-card flex justify-between items-end border border-zinc-800">
                      <span className="text-zinc-400 text-sm">Disk</span>
                      <span className="text-white text-lg font-light">-</span>
                    </div>
                    <div className="bg-zinc-800/50 p-4 rounded-card flex justify-between items-end border border-zinc-800">
                      <span className="text-zinc-400 text-sm">Uptime</span>
                      <span className="text-white text-lg font-light">{selectedProject.uptime || '-'}</span>
                    </div>
                  </div>

                  <div className="mt-auto">
                    {/* Footer Info */}
                    <div className="grid grid-cols-2 gap-8 border-t border-zinc-800 pt-6 mb-6">
                      <div>
                        <p className="text-zinc-500 text-xs mb-1">Last Deployed</p>
                        <p className="text-lg text-white">-</p>
                      </div>
                      <div>
                        <p className="text-zinc-500 text-xs mb-1">Environment</p>
                        <p className="text-lg text-white">Production</p>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex justify-end items-center space-x-4">
                      <button
                        onClick={() => setIsUpdateModalOpen(true)}
                        className="p-3 rounded-pill border border-zinc-700 hover:bg-zinc-800 text-zinc-400 font-medium transition-colors"
                        title="Update Source"
                      >
                        <UploadCloud className="w-5 h-5" />
                      </button>
                      {selectedProject.status === "running" ? (
                        <button
                          onClick={() => stopProject(selectedProject.id)}
                          className="p-3 rounded-pill border border-zinc-700 hover:bg-zinc-800 text-zinc-400"
                        >
                          <Square className="w-5 h-5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => startProject(selectedProject.id)}
                          className="p-3 rounded-pill border border-zinc-700 hover:bg-zinc-800 text-zinc-400"
                        >
                          <Play className="w-5 h-5" />
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteTarget(selectedProject.id)}
                        className="p-3 rounded-pill border border-zinc-700 hover:bg-zinc-800 text-zinc-400"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => navigate(`/projects/${selectedProject.id}`)}
                        className="bg-neon text-primary-foreground font-semibold px-8 py-3 rounded-pill hover:bg-neon-hover transition-colors"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {filteredProjects.length === 0 && (
          <div className="text-center py-12 px-8">
            {projects.length === 0 ? (
              <div className="flex flex-col items-center gap-4">
                <FilePlus className="w-12 h-12 text-zinc-600" />
                <div>
                  <p className="text-zinc-400 text-lg mb-2">No projects yet</p>
                  <p className="text-zinc-500 text-sm mb-4">Add projects to see them here</p>
                </div>
                <button
                  onClick={() => navigate('/deploy')}
                  className="px-4 py-2 rounded-pill bg-neon text-primary-foreground hover:bg-neon/90 font-medium text-sm transition-colors"
                >
                  Create Project
                </button>
              </div>
            ) : (
              <p className="text-zinc-400">No projects found matching your criteria.</p>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-panel rounded-panel p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold text-panel-foreground mb-2">
              Delete {projects.find(p => p.id === deleteTarget)?.name}?
            </h3>
            <p className="text-zinc-600 mb-6">
              This action cannot be undone. The project and all its data will be permanently removed.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-pill border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteProject(deleteTarget);
                  setDeleteTarget(null);
                  if (selectedId === deleteTarget) {
                    setSelectedId(projects.filter(p => p.id !== deleteTarget)[0]?.id || null);
                  }
                }}
                className="px-4 py-2 rounded-pill bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Project Modal */}
      {selectedProject && (
        <UpdateProjectModal
          isOpen={isUpdateModalOpen}
          onClose={() => setIsUpdateModalOpen(false)}
          project={selectedProject}
        />
      )}
    </DashboardLayout>
  );
}

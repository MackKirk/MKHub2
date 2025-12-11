import React, { useState } from "react";
import { View } from "react-native";
import { ProjectSelectScreen } from "./ProjectSelectScreen";
import { ProjectActionsScreen } from "./ProjectActionsScreen";
import { ProjectUploadScreen } from "./ProjectUploadScreen";
import { ProjectReportsScreen } from "./ProjectReportsScreen";
import { ProjectWorkloadScreen } from "./ProjectWorkloadScreen";
import { ProjectProposalViewScreen } from "./ProjectProposalViewScreen";
import { ProjectEstimateScreen } from "./ProjectEstimateScreen";
import { ProjectOrdersScreen } from "./ProjectOrdersScreen";
import type { ProjectListItem } from "../../types/projects";

type Screen =
  | "select"
  | "actions"
  | "upload"
  | "proposals"
  | "workload"
  | "proposal"
  | "estimate"
  | "orders";

export const OpportunityScreen: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>("select");
  const [selectedProject, setSelectedProject] = useState<ProjectListItem | null>(null);

  const handleSelectProject = (project: ProjectListItem) => {
    setSelectedProject(project);
    setCurrentScreen("actions");
  };

  const handleBack = () => {
    if (currentScreen === "actions") {
      setCurrentScreen("select");
      setSelectedProject(null);
    } else {
      setCurrentScreen("actions");
    }
  };

  if (!selectedProject) {
    return <ProjectSelectScreen onSelectProject={handleSelectProject} />;
  }

  switch (currentScreen) {
    case "actions":
      return (
        <ProjectActionsScreen
          project={selectedProject}
          onBack={handleBack}
          onUploadImages={() => setCurrentScreen("upload")}
          onViewProposals={() => setCurrentScreen("proposals")}
          onViewWorkload={() => setCurrentScreen("workload")}
          onViewProposal={() => setCurrentScreen("proposal")}
          onViewEstimate={() => setCurrentScreen("estimate")}
          onViewOrders={() => setCurrentScreen("orders")}
        />
      );
    case "upload":
      return (
        <ProjectUploadScreen
          project={selectedProject}
          onBack={handleBack}
        />
      );
    case "proposals":
      return (
        <ProjectReportsScreen
          project={selectedProject}
          onBack={handleBack}
        />
      );
    case "workload":
      return (
        <ProjectWorkloadScreen
          project={selectedProject}
          onBack={handleBack}
        />
      );
    case "proposal":
      return (
        <ProjectProposalViewScreen
          project={selectedProject}
          onBack={handleBack}
        />
      );
    case "estimate":
      return (
        <ProjectEstimateScreen
          project={selectedProject}
          onBack={handleBack}
        />
      );
    case "orders":
      return (
        <ProjectOrdersScreen
          project={selectedProject}
          onBack={handleBack}
        />
      );
    default:
      return <ProjectSelectScreen onSelectProject={handleSelectProject} />;
  }
};

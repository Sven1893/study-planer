import React, { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { Trash2, CheckCircle2, BookOpen, GraduationCap, Eye, EyeOff } from 'lucide-react';

const groupBy = (array, keyFn) => {
  return array.reduce((result, item) => {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
    return result;
  }, {});
};

const STORAGE_KEY = 'studyPlannerModulesMScInformatik';
const SEMESTER_STORAGE_KEY = 'studyPlannerSemestersMScInformatik';
const TITLE_STORAGE_KEY = 'studyPlannerTitleMScInformatik';
const REQUIREMENTS_STORAGE_KEY = 'studyPlannerRequirementsMScInformatik';
const DEFAULT_SEMESTERS = ['Semester 1', 'Semester 2', 'Semester 3', 'Semester 4'];
const DEFAULT_TITLE = 'Study Planner - Master of Science Informatik';
const DEFAULT_REQUIREMENTS = [
  { id: 'req-tmg-inf', title: 'TMG INF', requiredCredits: 6 },
  { id: 'req-minf', title: 'MINF', requiredCredits: 24 },
  { id: 'req-hauptseminar', title: 'Hauptseminar', requiredCredits: 3 },
  { id: 'req-schluesselqualifikation', title: 'Schluesselqualifikation', requiredCredits: 3 },
  { id: 'req-vertiefungslinie', title: 'Vertiefungslinie', requiredCredits: 24 },
  { id: 'req-ergaenzende', title: 'Ergaenzende Spezialisierungsmodule', requiredCredits: 30 },
  { id: 'req-masterarbeit', title: 'Masterarbeit', requiredCredits: 30 },
];
const STATUSES = ['Planned', 'In Progress', 'Completed'];
const VALID_GRADES = ['1.0', '1.3', '1.7', '2.0', '2.3', '2.7', '3.0', '3.3', '3.7', '4.0'];
const DEFAULT_CREDITS_BY_CONTAINER = {
  'TMG INF': 6,
  MINF: 6,
  Hauptseminar: 3,
  Schluesselqualifikation: 3,
  Vertiefungslinie: 6,
  'Ergaenzende Spezialisierungsmodule': 6,
  Masterarbeit: 30,
};

const defaultContainerTitles = DEFAULT_REQUIREMENTS.map((requirement) => requirement.title);

const getDefaultCreditsForContainer = (container) => DEFAULT_CREDITS_BY_CONTAINER[container] ?? 6;

const normalizeSemesterList = (semesterList) => {
  if (!Array.isArray(semesterList) || semesterList.length === 0) {
    return DEFAULT_SEMESTERS;
  }

  return semesterList
    .filter((semester) => typeof semester === 'string' && semester.trim())
    .map((semester) => semester.trim());
};

const parseNumberInput = (value) => Number(String(value).replace(',', '.').trim());

const isValidCredits = (value) => {
  const normalized = String(value).replace(',', '.').trim();
  if (!normalized) {
    return false;
  }

  const parsed = parseNumberInput(normalized);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 30;
};

const isValidGrade = (value) => value === '' || VALID_GRADES.includes(String(value).replace(',', '.').trim());

const normalizeRequirements = (savedRequirements) => {
  if (!Array.isArray(savedRequirements) || savedRequirements.length === 0) {
    return DEFAULT_REQUIREMENTS;
  }

  return savedRequirements
    .filter((requirement) => requirement && typeof requirement.title === 'string' && requirement.title.trim())
    .map((requirement, index) => ({
      id: requirement.id ? String(requirement.id) : `req-${Date.now()}-${index}`,
      title: requirement.title.trim(),
      requiredCredits: isValidCredits(requirement.requiredCredits) ? parseNumberInput(requirement.requiredCredits) : 6,
      countTowardsTotal: requirement.countTowardsTotal !== false,
    }));
};

const sortModulesForDisplay = (modules, semesters) => {
  const semesterIndex = new Map(semesters.map((semester, index) => [semester, index]));
  return [...modules].sort((a, b) => {
    const aSemester = semesterIndex.get(a.semester) ?? Number.MAX_SAFE_INTEGER;
    const bSemester = semesterIndex.get(b.semester) ?? Number.MAX_SAFE_INTEGER;
    if (aSemester !== bSemester) {
      return aSemester - bSemester;
    }
    if ((a.order ?? 0) !== (b.order ?? 0)) {
      return (a.order ?? 0) - (b.order ?? 0);
    }
    return String(a.id).localeCompare(String(b.id));
  });
};

const resequenceModules = (modules) => {
  const semesterOrderCounters = {};

  return modules.map((module) => {
    const nextOrder = semesterOrderCounters[module.semester] ?? 0;
    semesterOrderCounters[module.semester] = nextOrder + 1;
    return { ...module, order: nextOrder };
  });
};

const normalizeModules = (savedModules, semesters, containerTitles) => {
  if (!Array.isArray(savedModules)) {
    return [];
  }

  return resequenceModules(sortModulesForDisplay(savedModules.map((module, index) => {
    const container = containerTitles.includes(module?.container) ? module.container : containerTitles[0];
    const semester = semesters.includes(module?.semester) ? module.semester : semesters[0];
    const status = STATUSES.includes(module?.status) ? module.status : STATUSES[0];
    const credits = isValidCredits(module?.credits) ? parseNumberInput(module.credits) : getDefaultCreditsForContainer(container);
    const grade = status === 'Completed' && isValidGrade(module?.grade) && module?.grade !== ''
      ? parseNumberInput(module.grade)
      : '';

    return {
      id: module?.id ? String(module.id) : `${Date.now()}-${index}`,
      name: typeof module?.name === 'string' && module.name.trim() ? module.name.trim() : 'Untitled Module',
      semester,
      container,
      status,
      credits,
      grade,
      order: typeof module?.order === 'number' ? module.order : index,
    };
  }), semesters));
};

const moveModuleToPosition = (modules, semesters, draggedModuleId, targetSemester, targetIndex = null) => {
  const groupedModules = groupBy(sortModulesForDisplay(modules, semesters), (module) => module.semester);
  let draggedModule = null;

  const cleanedGroups = semesters.reduce((result, semester) => {
    result[semester] = (groupedModules[semester] || []).filter((module) => {
      if (module.id === draggedModuleId) {
        draggedModule = module;
        return false;
      }
      return true;
    });
    return result;
  }, {});

  if (!draggedModule) {
    return modules;
  }

  const nextTargetModules = [...(cleanedGroups[targetSemester] || [])];
  const insertionIndex = targetIndex == null ? nextTargetModules.length : Math.max(0, Math.min(targetIndex, nextTargetModules.length));
  nextTargetModules.splice(insertionIndex, 0, { ...draggedModule, semester: targetSemester });
  cleanedGroups[targetSemester] = nextTargetModules;

  return resequenceModules(
    semesters.flatMap((semester) => cleanedGroups[semester] || []),
  );
};

const moveRequirementToPosition = (requirements, draggedRequirementId, targetIndex = null) => {
  const currentIndex = requirements.findIndex((requirement) => requirement.id === draggedRequirementId);
  if (currentIndex === -1) {
    return requirements;
  }

  const nextRequirements = [...requirements];
  const [draggedRequirement] = nextRequirements.splice(currentIndex, 1);
  const insertionIndex = targetIndex == null ? nextRequirements.length : Math.max(0, Math.min(targetIndex, nextRequirements.length));
  nextRequirements.splice(insertionIndex, 0, draggedRequirement);
  return nextRequirements;
};

export default function StudyPlaner() {
  const [plannerTitle, setPlannerTitle] = useState(() => localStorage.getItem(TITLE_STORAGE_KEY) || DEFAULT_TITLE);
  const [requirements, setRequirements] = useState(() => {
    const saved = localStorage.getItem(REQUIREMENTS_STORAGE_KEY);
    if (!saved) {
      return DEFAULT_REQUIREMENTS;
    }
    try {
      return normalizeRequirements(JSON.parse(saved));
    } catch (e) {
      return DEFAULT_REQUIREMENTS;
    }
  });
  const [semesters, setSemesters] = useState(() => {
    const saved = localStorage.getItem(SEMESTER_STORAGE_KEY);
    if (!saved) {
      return DEFAULT_SEMESTERS;
    }
    try {
      return normalizeSemesterList(JSON.parse(saved));
    } catch (e) {
      return DEFAULT_SEMESTERS;
    }
  });
  const [modules, setModules] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return [];
    }
    try {
      const nextRequirements = normalizeRequirements(JSON.parse(localStorage.getItem(REQUIREMENTS_STORAGE_KEY) || 'null'));
      return normalizeModules(
        JSON.parse(saved),
        normalizeSemesterList(JSON.parse(localStorage.getItem(SEMESTER_STORAGE_KEY) || 'null')),
        nextRequirements.map((requirement) => requirement.title),
      );
    } catch (e) {
      return [];
    }
  });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [modalInitialSemester, setModalInitialSemester] = useState(null);
  const [draggedModuleId, setDraggedModuleId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [draggedRequirementId, setDraggedRequirementId] = useState(null);
  const [requirementDropTarget, setRequirementDropTarget] = useState(null);
  const fileInputRef = useRef(null);
  const previousModulePositionsRef = useRef(new Map());
  const previousRequirementPositionsRef = useRef(new Map());
  const historyRef = useRef([]);
  const currentSnapshotRef = useRef(null);
  const isRestoringHistoryRef = useRef(false);

  const containerTitles = useMemo(() => requirements.map((requirement) => requirement.title), [requirements]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(modules));
  }, [modules]);

  useEffect(() => {
    localStorage.setItem(TITLE_STORAGE_KEY, plannerTitle);
  }, [plannerTitle]);

  useEffect(() => {
    localStorage.setItem(SEMESTER_STORAGE_KEY, JSON.stringify(semesters));
  }, [semesters]);

  useEffect(() => {
    localStorage.setItem(REQUIREMENTS_STORAGE_KEY, JSON.stringify(requirements));
  }, [requirements]);

  useEffect(() => {
    const snapshot = JSON.stringify({ plannerTitle, semesters, requirements, modules });

    if (currentSnapshotRef.current == null) {
      currentSnapshotRef.current = snapshot;
      return;
    }

    if (snapshot === currentSnapshotRef.current) {
      return;
    }

    if (isRestoringHistoryRef.current) {
      currentSnapshotRef.current = snapshot;
      isRestoringHistoryRef.current = false;
      return;
    }

    historyRef.current.push(currentSnapshotRef.current);
    if (historyRef.current.length > 100) {
      historyRef.current.shift();
    }
    currentSnapshotRef.current = snapshot;
  }, [plannerTitle, semesters, requirements, modules]);

  const orderedModules = useMemo(() => sortModulesForDisplay(modules, semesters), [modules, semesters]);
  const modulesBySemester = useMemo(() => groupBy(orderedModules, (module) => module.semester), [orderedModules]);
  const modulesByContainer = useMemo(() => groupBy(orderedModules, (module) => module.container), [orderedModules]);

  useLayoutEffect(() => {
    const moduleElements = Array.from(document.querySelectorAll('.module-card[data-module-id]'));
    const nextPositions = new Map();

    moduleElements.forEach((element) => {
      nextPositions.set(element.dataset.moduleId, element.getBoundingClientRect());
    });

    moduleElements.forEach((element) => {
      const moduleId = element.dataset.moduleId;
      const previousPosition = previousModulePositionsRef.current.get(moduleId);
      const nextPosition = nextPositions.get(moduleId);

      if (!previousPosition || !nextPosition) {
        return;
      }

      const deltaX = previousPosition.left - nextPosition.left;
      const deltaY = previousPosition.top - nextPosition.top;

      if (deltaX === 0 && deltaY === 0) {
        return;
      }

      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: 'translate(0, 0)' },
        ],
        {
          duration: 240,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        },
      );
    });

    previousModulePositionsRef.current = nextPositions;
  }, [orderedModules]);

  useLayoutEffect(() => {
    const requirementElements = Array.from(document.querySelectorAll('.analytics-card[data-requirement-id]'));
    const nextPositions = new Map();

    requirementElements.forEach((element) => {
      nextPositions.set(element.dataset.requirementId, element.getBoundingClientRect());
    });

    requirementElements.forEach((element) => {
      const requirementId = element.dataset.requirementId;
      const previousPosition = previousRequirementPositionsRef.current.get(requirementId);
      const nextPosition = nextPositions.get(requirementId);

      if (!previousPosition || !nextPosition) {
        return;
      }

      const deltaX = previousPosition.left - nextPosition.left;
      const deltaY = previousPosition.top - nextPosition.top;

      if (deltaX === 0 && deltaY === 0) {
        return;
      }

      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: 'translate(0, 0)' },
        ],
        {
          duration: 240,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        },
      );
    });

    previousRequirementPositionsRef.current = nextPositions;
  }, [requirements]);

  const includedRequirements = requirements.filter(req => req.countTowardsTotal !== false);
  const includedContainers = new Set(includedRequirements.map(req => req.title));
  const includedModules = orderedModules.filter(module => includedContainers.has(module.container));

  const totalRequiredCredits = includedRequirements.reduce((sum, requirement) => sum + requirement.requiredCredits, 0);
  const totalEarnedCredits = includedModules.filter((module) => module.status === 'Completed').reduce((sum, module) => sum + module.credits, 0);
  const totalInProgressCredits = includedModules.filter((module) => module.status === 'In Progress').reduce((sum, module) => sum + module.credits, 0);
  const totalPlannedCredits = includedModules.filter((module) => module.status === 'Planned').reduce((sum, module) => sum + module.credits, 0);
  const totalEarnedPercentage = totalRequiredCredits > 0 ? Math.min((totalEarnedCredits / totalRequiredCredits) * 100, 100) : 0;
  const totalInProgressPercentage = totalRequiredCredits > 0 ? Math.min((totalInProgressCredits / totalRequiredCredits) * 100, 100 - totalEarnedPercentage) : 0;
  const totalPlannedPercentage = totalRequiredCredits > 0 ? Math.min((totalPlannedCredits / totalRequiredCredits) * 100, 100 - totalEarnedPercentage - totalInProgressPercentage) : 0;
  const gradedCompletedModules = includedModules.filter((module) => module.status === 'Completed' && typeof module.grade === 'number' && !Number.isNaN(module.grade));
  const weightedGradeSum = gradedCompletedModules.reduce((sum, module) => sum + (module.grade * module.credits), 0);
  const gradedCredits = gradedCompletedModules.reduce((sum, module) => sum + module.credits, 0);
  const averageGrade = gradedCredits > 0 ? (weightedGradeSum / gradedCredits).toFixed(2) : null;
  const highestRemovableSemester = semesters.length > DEFAULT_SEMESTERS.length ? semesters[semesters.length - 1] : null;

  const closeModal = () => {
    setIsFormOpen(false);
    setModalInitialSemester(null);
  };

  const addModule = (newModule) => {
    setModules((currentModules) => resequenceModules(sortModulesForDisplay([
      ...currentModules,
      { id: Date.now().toString(), ...newModule, order: Number.MAX_SAFE_INTEGER },
    ], semesters)));
    closeModal();
  };

  const deleteModule = (moduleId) => {
    setModules((currentModules) => resequenceModules(sortModulesForDisplay(
      currentModules.filter((module) => module.id !== moduleId),
      semesters,
    )));
  };

  const updateModule = (moduleId, updates) => {
    setModules((currentModules) => resequenceModules(sortModulesForDisplay(
      currentModules.map((module) => module.id === moduleId ? { ...module, ...updates } : module),
      semesters,
    )));
  };

  const moveContainer = (moduleId, newContainer) => {
    updateModule(moduleId, { container: newContainer });
  };

  const updateCredits = (moduleId, newCredits) => {
    if (!isValidCredits(newCredits)) {
      window.alert('Please enter valid ECTS between 0.5 and 30.');
      return;
    }

    updateModule(moduleId, { credits: parseNumberInput(newCredits) });
  };

  const addSemester = () => {
    setSemesters((currentSemesters) => [...currentSemesters, `Semester ${currentSemesters.length + 1}`]);
  };

  const removeSemester = (semesterToRemove) => {
    const hasModules = modules.some((module) => module.semester === semesterToRemove);
    if (hasModules) {
      window.alert('Please move or delete the modules in this semester before removing it.');
      return;
    }

    setSemesters((currentSemesters) => currentSemesters.filter((semester) => semester !== semesterToRemove));
  };

  const openAddModuleModal = (semester) => {
    setModalInitialSemester(semester);
    setIsFormOpen(true);
  };

  const startDraggingModule = (event, moduleId) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', moduleId);
    setDraggedModuleId(moduleId);
  };

  const stopDraggingModule = () => {
    setDraggedModuleId(null);
    setDropTarget(null);
  };

  const updateDropLocation = (semester, index = null) => {
    setDropTarget({ semester, index });
  };

  const dropModuleIntoSemester = (semester, index = null) => {
    if (!draggedModuleId) {
      return;
    }

    setModules((currentModules) => moveModuleToPosition(currentModules, semesters, draggedModuleId, semester, index));
    setDraggedModuleId(null);
    setDropTarget(null);
  };

  const renameSemester = (oldSemester, newSemester) => {
    const trimmedSemester = newSemester.trim();
    if (!trimmedSemester || trimmedSemester === oldSemester) {
      return;
    }

    if (semesters.includes(trimmedSemester)) {
      window.alert('A semester with this name already exists.');
      return;
    }

    const renamedSemesters = semesters.map((semester) => semester === oldSemester ? trimmedSemester : semester);
    setSemesters(renamedSemesters);
    setModules((currentModules) => resequenceModules(sortModulesForDisplay(
      currentModules.map((module) => module.semester === oldSemester ? { ...module, semester: trimmedSemester } : module),
      renamedSemesters,
    )));
  };

  const toggleStatus = (moduleId) => {
    setModules((currentModules) => currentModules.map((module) => {
      if (module.id === moduleId) {
        const nextStatus = module.status === 'Planned' ? 'In Progress' : module.status === 'In Progress' ? 'Completed' : 'Planned';
        return {
          ...module,
          status: nextStatus,
          grade: nextStatus === 'Completed' ? module.grade ?? '' : '',
        };
      }
      return module;
    }));
  };

  const updateGrade = (moduleId, newGrade) => {
    const normalizedGrade = String(newGrade).replace(',', '.').trim();
    if (!isValidGrade(normalizedGrade)) {
      window.alert(`Please use a valid grade: ${VALID_GRADES.join(', ')}`);
      return;
    }

    setModules((currentModules) => currentModules.map((module) => {
      if (module.id !== moduleId) {
        return module;
      }

      if (normalizedGrade === '') {
        return { ...module, grade: '' };
      }
      return { ...module, grade: parseNumberInput(normalizedGrade) };
    }));
  };

  const handleExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      plannerTitle,
      requirements,
      semesters,
      modules: orderedModules,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'study-planner-export.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const importedData = JSON.parse(await file.text());
      const nextRequirements = normalizeRequirements(importedData?.requirements);
      const nextSemesters = normalizeSemesterList(importedData?.semesters);
      const nextModules = normalizeModules(importedData?.modules, nextSemesters, nextRequirements.map((requirement) => requirement.title));
      setPlannerTitle(typeof importedData?.plannerTitle === 'string' && importedData.plannerTitle.trim() ? importedData.plannerTitle.trim() : DEFAULT_TITLE);
      setRequirements(nextRequirements);
      setSemesters(nextSemesters);
      setModules(nextModules);
    } catch (error) {
      window.alert('The selected file could not be imported.');
    } finally {
      event.target.value = '';
    }
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        const previousSnapshot = historyRef.current.pop();
        if (!previousSnapshot) {
          return;
        }
        event.preventDefault();
        isRestoringHistoryRef.current = true;
        const parsedSnapshot = JSON.parse(previousSnapshot);
        setPlannerTitle(parsedSnapshot.plannerTitle);
        setSemesters(parsedSnapshot.semesters);
        setRequirements(parsedSnapshot.requirements);
        setModules(parsedSnapshot.modules);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const startDraggingRequirement = (event, requirementId) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', requirementId);
    setDraggedRequirementId(requirementId);
  };

  const stopDraggingRequirement = () => {
    setDraggedRequirementId(null);
    setRequirementDropTarget(null);
  };

  const updateRequirementDropLocation = (index = null) => {
    setRequirementDropTarget(index);
  };

  const dropRequirement = (index = null) => {
    if (!draggedRequirementId) {
      return;
    }

    setRequirements((currentRequirements) => moveRequirementToPosition(currentRequirements, draggedRequirementId, index));
    setDraggedRequirementId(null);
    setRequirementDropTarget(null);
  };

  return (
    <div className="study-planer-layout">
      <header className="app-header">
        <div className="logo">
          <GraduationCap size={40} className="logo-icon" />
          <InlineEditable
            className="planner-title-edit"
            value={plannerTitle}
            onSave={(newTitle) => setPlannerTitle(newTitle.trim() || plannerTitle)}
          >
            <h1>{plannerTitle}</h1>
          </InlineEditable>
        </div>
        <div className="header-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden-file-input"
            onChange={handleImportFile}
          />
          <button type="button" className="secondary-btn" onClick={() => fileInputRef.current?.click()}>Import JSON</button>
          <button type="button" className="secondary-btn" onClick={handleExport}>Export JSON</button>
        </div>
      </header>

      <div className="overall-progress-section">
        <div className="op-header">
          <h2>Degree Progress</h2>
          <span className="fraction">{totalEarnedCredits} / {totalRequiredCredits} ECTS</span>
        </div>
        <div className="op-header">
          <h2>Current Average</h2>
          <span className="fraction">{averageGrade ?? '-'}</span>
        </div>
        <div className="progress-bar-large">
          <div className="progress-fill earned" style={{ width: `${totalEarnedPercentage}%` }} />
          <div className="progress-fill in-progress" style={{ width: `${totalInProgressPercentage}%` }} />
          <div className="progress-fill planned" style={{ width: `${totalPlannedPercentage}%` }} />
        </div>
        <div className="op-legend">
          <span><span className="dot earned" /> Completed ({totalEarnedCredits} ECTS)</span>
          <span><span className="dot in-progress" /> In Progress ({totalInProgressCredits} ECTS)</span>
          <span><span className="dot planned" /> Planned ({totalPlannedCredits} ECTS)</span>
        </div>
      </div>

      {isFormOpen && (
        <ModuleModal
          onClose={closeModal}
          onAdd={addModule}
          allSemesters={semesters}
          containers={containerTitles}
          initialSemester={modalInitialSemester}
        />
      )}

      <main className="main-content">
        <section className="timeline-section">
          <h2><BookOpen size={24} /> Semester Timeline</h2>
          <div className="timeline-grid">
            {semesters.map(sem => (
              <SemesterColumn
                key={sem}
                title={sem}
                modules={modulesBySemester[sem] || []}
                onMoveContainer={moveContainer}
                onRenameSemester={renameSemester}
                onAddModule={openAddModuleModal}
                onUpdateModule={updateModule}
                onUpdateCredits={updateCredits}
                containers={containerTitles}
                draggedModuleId={draggedModuleId}
                dropTarget={dropTarget}
                onDragModuleStart={startDraggingModule}
                onDragModuleEnd={stopDraggingModule}
                onDragOverSemester={updateDropLocation}
                onDropModule={dropModuleIntoSemester}
                onDelete={deleteModule}
                onToggleStatus={toggleStatus}
                onUpdateGrade={updateGrade}
                canRemove={sem === highestRemovableSemester}
                onRemoveSemester={removeSemester}
              />
            ))}
            <AddSemesterCard nextSemesterLabel={`Semester ${semesters.length + 1}`} onAddSemester={addSemester} />
          </div>
        </section>

        <aside className="analytics-section">
          <h2>Degree Requirements</h2>
          {requirements.map((requirement, index) => (
            <ContainerAnalytics
              key={requirement.id}
              requirement={requirement}
              modules={modulesByContainer[requirement.title] || []}
              index={index}
              isDragging={draggedRequirementId === requirement.id}
              isDropTarget={requirementDropTarget === index}
              onDragStart={startDraggingRequirement}
              onDragEnd={stopDraggingRequirement}
              onDragOverAt={updateRequirementDropLocation}
              onDropAt={dropRequirement}
              onRename={(newTitle) => {
                const trimmedTitle = newTitle.trim();
                if (!trimmedTitle || trimmedTitle === requirement.title) {
                  return;
                }
                if (containerTitles.includes(trimmedTitle)) {
                  window.alert('A requirement with this title already exists.');
                  return;
                }
                setRequirements((currentRequirements) => currentRequirements.map((currentRequirement) => (
                  currentRequirement.id === requirement.id
                    ? { ...currentRequirement, title: trimmedTitle }
                    : currentRequirement
                )));
                setModules((currentModules) => resequenceModules(sortModulesForDisplay(
                  currentModules.map((module) => module.container === requirement.title ? { ...module, container: trimmedTitle } : module),
                  semesters,
                )));
              }}
              onUpdateCredits={(newCredits) => {
                if (!isValidCredits(newCredits)) {
                  window.alert('Please enter valid required ECTS between 0.5 and 30.');
                  return;
                }
                setRequirements((currentRequirements) => currentRequirements.map((currentRequirement) => (
                  currentRequirement.id === requirement.id
                    ? { ...currentRequirement, requiredCredits: parseNumberInput(newCredits) }
                    : currentRequirement
                )));
              }}
              onDelete={() => {
                if (requirements.length === 1) {
                  window.alert('At least one requirement must remain.');
                  return;
                }
                const hasModules = modules.some((module) => module.container === requirement.title);
                if (hasModules) {
                  window.alert('Please move or delete the modules in this requirement before removing it.');
                  return;
                }
                setRequirements((currentRequirements) => currentRequirements.filter((currentRequirement) => currentRequirement.id !== requirement.id));
              }}
              onToggleCount={() => {
                setRequirements((currentRequirements) => currentRequirements.map((currentRequirement) => (
                  currentRequirement.id === requirement.id
                    ? { ...currentRequirement, countTowardsTotal: currentRequirement.countTowardsTotal === false }
                    : currentRequirement
                )));
              }}
            />
          ))}
          <div
            className={`requirement-drop-zone end-zone ${requirementDropTarget === requirements.length ? 'active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              updateRequirementDropLocation(requirements.length);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dropRequirement(requirements.length);
            }}
          />
          <button
            type="button"
            className="add-requirement-btn"
            onClick={() => {
              const baseTitle = 'New Requirement';
              let nextTitle = baseTitle;
              let suffix = 2;
              while (containerTitles.includes(nextTitle)) {
                nextTitle = `${baseTitle} ${suffix}`;
                suffix += 1;
              }
              setRequirements((currentRequirements) => [
                ...currentRequirements,
                { id: `req-${Date.now()}`, title: nextTitle, requiredCredits: 6 },
              ]);
            }}
          >
            + Add Requirement
          </button>
        </aside>
      </main>
    </div>
  );
}

function SemesterColumn({
  title,
  modules,
  containers,
  draggedModuleId,
  dropTarget,
  onMoveContainer,
  onRenameSemester,
  onAddModule,
  onUpdateModule,
  onUpdateCredits,
  onDragModuleStart,
  onDragModuleEnd,
  onDragOverSemester,
  onDropModule,
  onDelete,
  onToggleStatus,
  onUpdateGrade,
  canRemove,
  onRemoveSemester,
}) {
  const credits = modules.reduce((sum, m) => sum + m.credits, 0);
  const isDropActive = dropTarget?.semester === title;
  const getInsertionIndexFromPointer = (event, index) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const midpoint = bounds.top + (bounds.height / 2);
    return event.clientY < midpoint ? index : index + 1;
  };

  return (
    <div
      className={`semester-col ${isDropActive ? 'drop-active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverSemester(title, modules.length);
      }}
      onDrop={() => onDropModule(title, modules.length)}
    >
      <div className="semester-header">
        <InlineEditable
          className="semester-title-edit"
          value={title}
          onSave={(newTitle) => onRenameSemester(title, newTitle)}
        >
          <h3>{title}</h3>
        </InlineEditable>
        <div className="semester-header-actions">
          <button
            type="button"
            className="semester-icon-btn add-module-btn"
            onClick={() => onAddModule(title)}
            title={`Add module to ${title}`}
          >
            +
          </button>
          <span className="credits-badge">{credits} ECTS</span>
        </div>
      </div>
      {canRemove && (
        <button
          type="button"
          className="semester-delete-btn"
          onClick={() => onRemoveSemester(title)}
          title={`Remove ${title}`}
        >
          <Trash2 size={14} />
        </button>
      )}
      <div className="module-list">
        {modules.map((module, index) => (
          <React.Fragment key={module.id}>
            <div
              className={`module-drop-zone ${dropTarget?.semester === title && dropTarget?.index === index ? 'active' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDragOverSemester(title, index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDropModule(title, index);
              }}
            />
            <div
              data-module-id={module.id}
              className={`module-card status-${module.status.toLowerCase().replace(' ', '-')} ${draggedModuleId === module.id ? 'is-dragging' : ''}`}
              draggable
              onDragStart={(e) => onDragModuleStart(e, module.id)}
              onDragEnd={onDragModuleEnd}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDragOverSemester(title, getInsertionIndexFromPointer(e, index));
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDropModule(title, getInsertionIndexFromPointer(e, index));
              }}
            >
              <div className="module-header">
                <InlineEditable
                  className="module-title-edit"
                  value={module.name}
                  onSave={(newName) => onUpdateModule(module.id, { name: newName.trim() || module.name })}
                >
                  <h4>{module.name}</h4>
                </InlineEditable>
                <button
                  className="status-toggle"
                  onClick={() => onToggleStatus(module.id)}
                  title={`Status: ${module.status}. Click to change.`}
                >
                  {module.status === 'Completed' && <CheckCircle2 size={18} className="icon-success" />}
                  {module.status === 'In Progress' && <div className="icon-pulse" />}
                  {module.status === 'Planned' && <div className="icon-planned" />}
                </button>
              </div>
              <div className="module-meta">
                <span className="tag-container">{module.container}</span>
                <InlineEditable
                  className="tag-credits inline-chip-edit"
                  value={String(module.credits)}
                  inputMode="decimal"
                  onSave={(newCredits) => onUpdateCredits(module.id, newCredits)}
                >
                  <span className="tag-credits">{module.credits} ECTS</span>
                </InlineEditable>
                {module.status === 'Completed' && (
                  <InlineEditable
                    className="tag-grade inline-chip-edit"
                    value={module.grade === '' || module.grade == null ? '' : String(module.grade)}
                    inputMode="decimal"
                    placeholder="1.7"
                    onSave={(newGrade) => onUpdateGrade(module.id, newGrade)}
                  >
                    <span className={`tag-grade ${module.grade === '' || module.grade == null ? 'empty' : ''}`}>
                      {module.grade === '' || module.grade == null ? 'Grade' : `Grade: ${module.grade}`}
                    </span>
                  </InlineEditable>
                )}
              </div>
              <div className="module-actions">
                <span className="semester-label">{module.semester}</span>
                <select
                  value={module.container}
                  onChange={(e) => onMoveContainer(module.id, e.target.value)}
                  className="container-select"
                >
                  {containers.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button className="delete-btn" onClick={() => onDelete(module.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </React.Fragment>
        ))}
        <div
          className={`module-drop-zone end-zone ${dropTarget?.semester === title && dropTarget?.index === modules.length ? 'active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDragOverSemester(title, modules.length);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDropModule(title, modules.length);
          }}
        />
        {modules.length === 0 && (
          <div className={`empty-state ${isDropActive ? 'drop-active' : ''}`}>No modules planned</div>
        )}
      </div>
    </div>
  );
}

function InlineEditable({ value, onSave, children, className = '', inputMode = 'text', placeholder = '' }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(value);
    }
  }, [value, isEditing]);

  const finishEditing = (shouldSave) => {
    if (shouldSave) {
      onSave(draftValue);
    } else {
      setDraftValue(value);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        className={`inline-edit-input ${className}`.trim()}
        type="text"
        inputMode={inputMode}
        value={draftValue}
        placeholder={placeholder}
        autoFocus
        onChange={(e) => setDraftValue(e.target.value)}
        onBlur={() => finishEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            finishEditing(true);
          }
          if (e.key === 'Escape') {
            finishEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div
      className={`inline-edit-display ${className}`.trim()}
      onDoubleClick={() => setIsEditing(true)}
      title="Double-click to edit"
    >
      {children}
    </div>
  );
}

function AddSemesterCard({ nextSemesterLabel, onAddSemester }) {
  return (
    <button type="button" className="semester-col add-semester-card" onClick={onAddSemester}>
      <div className="add-semester-content">
        <span className="add-semester-plus">+</span>
        <span className="add-semester-label">{nextSemesterLabel}</span>
      </div>
    </button>
  );
}

function ContainerAnalytics({
  requirement,
  modules,
  index,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragOverAt,
  onDropAt,
  onRename,
  onUpdateCredits,
  onDelete,
  onToggleCount,
}) {
  const { title, requiredCredits, countTowardsTotal } = requirement;
  const isIncluded = countTowardsTotal !== false;
  const getInsertionIndexFromPointer = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const midpoint = bounds.top + (bounds.height / 2);
    return event.clientY < midpoint ? index : index + 1;
  };
  const earnedCredits = modules.filter(m => m.status === 'Completed').reduce((sum, m) => sum + m.credits, 0);
  const inProgressCredits = modules.filter(m => m.status === 'In Progress').reduce((sum, m) => sum + m.credits, 0);
  const plannedCredits = modules.filter(m => m.status === 'Planned').reduce((sum, m) => sum + m.credits, 0);
  const totalCredits = earnedCredits + inProgressCredits + plannedCredits;
  const overflowCredits = Math.max(totalCredits - requiredCredits, 0);

  const earnedPercentage = Math.min((earnedCredits / requiredCredits) * 100, 100);
  const inProgressPercentage = Math.min((inProgressCredits / requiredCredits) * 100, 100 - earnedPercentage);
  const plannedPercentage = Math.min((plannedCredits / requiredCredits) * 100, 100 - earnedPercentage - inProgressPercentage);

  return (
    <div className="requirement-dnd-item">
      <div
        className={`requirement-drop-zone ${isDropTarget ? 'active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragOverAt(index);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDropAt(index);
        }}
      />
      <div
        data-requirement-id={requirement.id}
        className={`analytics-card ${overflowCredits > 0 ? 'is-overfull' : ''} ${isDragging ? 'is-dragging' : ''} ${!isIncluded ? 'is-excluded' : ''}`}
        draggable
        onDragStart={(e) => onDragStart(e, requirement.id)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragOverAt(getInsertionIndexFromPointer(e));
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDropAt(getInsertionIndexFromPointer(e));
        }}
      >
        <div className="ac-header">
          <InlineEditable className="requirement-title-edit" value={title} onSave={onRename}>
            <h3>{title}</h3>
          </InlineEditable>
          <div className="requirement-header-actions">
            <button
               type="button"
               className={`requirement-toggle-btn ${isIncluded ? 'included' : 'excluded'}`}
               onClick={onToggleCount}
               title={isIncluded ? 'Included in total progress' : 'Excluded from total progress'}
            >
               {isIncluded ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <InlineEditable className="requirement-credits-edit" value={String(requiredCredits)} inputMode="decimal" onSave={onUpdateCredits}>
              <span className="fraction">{totalCredits} / {requiredCredits} ECTS</span>
            </InlineEditable>
            <button type="button" className="requirement-delete-btn" onClick={onDelete} title={`Delete ${title}`}>
              <Trash2 size={15} />
            </button>
          </div>
        </div>
        <div className="progress-bar">
          <div className="progress-fill earned" style={{ width: `${earnedPercentage}%` }} />
          <div className="progress-fill in-progress" style={{ width: `${inProgressPercentage}%` }} />
          <div className="progress-fill planned" style={{ width: `${plannedPercentage}%` }} />
        </div>
        <div className="ac-legend">
          <span><span className="dot earned" /> Completed ({earnedCredits})</span>
          <span><span className="dot in-progress" /> In Progress ({inProgressCredits})</span>
          <span><span className="dot planned" /> Planned ({plannedCredits})</span>
        </div>
        {overflowCredits > 0 && (
          <div className="overflow-note">Over planned by {overflowCredits} ECTS</div>
        )}
      </div>
    </div>
  );
}

function ModuleModal({ onClose, onAdd, allSemesters, containers, initialSemester }) {
  const [name, setName] = useState('');
  const [credits, setCredits] = useState(String(getDefaultCreditsForContainer(containers[0])));
  const [semester, setSemester] = useState(initialSemester || allSemesters[0]);
  const [container, setContainer] = useState(containers[0]);
  const [status, setStatus] = useState(STATUSES[0]);
  const [grade, setGrade] = useState('');
  const [creditsTouched, setCreditsTouched] = useState(false);

  const handleContainerChange = (nextContainer) => {
    setContainer(nextContainer);
    if (!creditsTouched) {
      setCredits(String(getDefaultCreditsForContainer(nextContainer)));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      window.alert('Please enter a module name.');
      return;
    }
    if (!isValidCredits(credits)) {
      window.alert('Please enter valid ECTS between 0.5 and 30.');
      return;
    }
    if (status === 'Completed' && !isValidGrade(grade)) {
      window.alert(`Please use a valid grade: ${VALID_GRADES.join(', ')}`);
      return;
    }
    onAdd({
      name: name.trim(),
      credits: parseNumberInput(credits),
      semester,
      container,
      status,
      grade: status === 'Completed' && grade !== '' ? parseNumberInput(grade) : '',
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Add New Module</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Module Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} autoFocus required placeholder="e.g. Data Structures" />
          </div>
          <div className="form-group-row">
            <div className="form-group">
              <label>Credits (ECTS)</label>
              <input
                type="text"
                inputMode="decimal"
                value={credits}
                onChange={e => {
                  setCredits(e.target.value);
                  setCreditsTouched(true);
                }}
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {status === 'Completed' && (
            <div className="form-group">
              <label>Grade</label>
              <input
                type="text"
                inputMode="decimal"
                value={grade}
                onChange={e => setGrade(e.target.value)}
                placeholder="e.g. 1.7"
              />
              <span className="helper-text">Valid grades: {VALID_GRADES.join(', ')}</span>
            </div>
          )}
          <div className="form-group-row">
            <div className="form-group">
              <label>Semester</label>
              <select value={semester} onChange={e => setSemester(e.target.value)}>
                {allSemesters.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Container</label>
              <select value={container} onChange={e => handleContainerChange(e.target.value)}>
                {containers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="helper-text">Suggested ECTS are filled automatically based on the selected container until you edit them yourself.</div>
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-submit">Add Module</button>
          </div>
        </form>
      </div>
    </div>
  );
}

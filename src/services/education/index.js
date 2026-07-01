const { pool } = require('../../config/db');
const { AcademicIntegrityService } = require('./AcademicIntegrityService');
const { AcademicResearchService } = require('./AcademicResearchService');
const { AnnotationService } = require('./AnnotationService');
const { CaseBriefService } = require('./CaseBriefService');
const { CitationExportService } = require('./CitationExportService');
const { CourseService } = require('./CourseService');
const { EducationAccessService } = require('./EducationAccessService');
const { EducationAiService } = require('./EducationAiService');
const { EntitlementService } = require('./EntitlementService');
const { LearningAssistantService } = require('./LearningAssistantService');
const { LearningWorkspaceService } = require('./LearningWorkspaceService');
const { MootCourtService } = require('./MootCourtService');
const { QuizService } = require('./QuizService');
const { StudyNoteService } = require('./StudyNoteService');

function createEducationServices({ db = pool, model } = {}) {
  const access = new EducationAccessService({ db });
  const entitlements = new EntitlementService({ db });
  const integrity = new AcademicIntegrityService({ db });
  const ai = new EducationAiService({ db, ...(model ? { model } : {}) });
  return {
    access,
    entitlements,
    integrity,
    ai,
    workspaceService: new LearningWorkspaceService({ db, access, entitlements }),
    noteService: new StudyNoteService({ db, access, ai, entitlements }),
    briefService: new CaseBriefService({ db, access, ai, entitlements }),
    quizService: new QuizService({ db, access, ai, entitlements, integrity }),
    mootService: new MootCourtService({ db, access, ai, entitlements, integrity }),
    researchService: new AcademicResearchService({ db, access, entitlements }),
    annotationService: new AnnotationService({ db, access }),
    courseService: new CourseService({ db, access, entitlements }),
    exportService: new CitationExportService({ db, access, entitlements }),
    assistantService: new LearningAssistantService({ db, access, entitlements }),
  };
}

let services = createEducationServices();
function getEducationServices() { return services; }
function setEducationServicesForTests(next) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Education service replacement is test-only.');
  services = next;
}

module.exports = { createEducationServices, getEducationServices, setEducationServicesForTests };

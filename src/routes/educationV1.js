const express = require('express');
const controller = require('../controllers/educationController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.post('/learning-workspaces', controller.createWorkspace);
router.get('/learning-workspaces', controller.listWorkspaces);
router.get('/learning-workspaces/:workspaceId', controller.getWorkspace);
router.patch('/learning-workspaces/:workspaceId', controller.updateWorkspace);
router.delete('/learning-workspaces/:workspaceId', controller.deleteWorkspace);
router.post('/learning-workspaces/:workspaceId/topics', controller.createTopic);
router.post('/learning-workspaces/:workspaceId/notes', controller.createNote);
router.post('/learning-workspaces/:workspaceId/case-briefs', controller.createBrief);
router.post('/learning-workspaces/:workspaceId/flashcards/generate', controller.generateFlashcards);
router.post('/learning-workspaces/:workspaceId/quizzes', controller.createQuiz);
router.post('/learning-workspaces/:workspaceId/source-collections', controller.createCollection);
router.post('/learning-workspaces/:workspaceId/annotations', controller.createAnnotation);
router.get('/learning-workspaces/:workspaceId/annotations', controller.listAnnotations);
router.post('/learning-workspaces/:workspaceId/research', controller.research);

router.get('/study-notes/:noteId', controller.getNote);
router.patch('/study-notes/:noteId', controller.updateNote);
router.post('/study-notes/:noteId/suggestions', controller.suggestNote);
router.get('/study-notes/:noteId/export/:format', controller.exportNote);
router.post('/source-collections/:collectionId/items', controller.addCollectionItem);

router.post('/case-briefs/:briefId/generate', controller.generateBrief);
router.get('/case-briefs/:briefId', controller.getBrief);
router.patch('/case-briefs/:briefId', controller.updateBrief);
router.get('/quiz-sets/:quizId', controller.getQuiz);
router.post('/quiz-sets/:quizId/attempts', controller.createAttempt);
router.post('/quiz-attempts/:attemptId/submit', controller.submitAttempt);

router.post('/moot-scenarios', controller.createMootScenario);
router.post('/moot-scenarios/:scenarioId/sessions', controller.startMootSession);
router.post('/moot-sessions/:sessionId/messages', controller.mootMessage);

router.post('/research-projects', controller.createProject);
router.get('/research-projects/:projectId', controller.getProject);
router.post('/research-projects/:projectId/entries', controller.createEntry);
router.post('/research-projects/:projectId/coding-schemas', controller.createCodingSchema);
router.post('/research-projects/:projectId/coded-items', controller.codeSource);
router.get('/research-projects/:projectId/export', controller.exportProject);

router.post('/courses', controller.createCourse);
router.post('/courses/:courseId/invitations', controller.inviteCourse);
router.post('/course-invitations/accept', controller.acceptCourseInvitation);
router.post('/courses/:courseId/assignments', controller.createAssignment);
router.get('/courses/:courseId/assignments', controller.listAssignments);
router.post('/assignments/:assignmentId/submissions', controller.createSubmission);
router.get('/submissions/:submissionId', controller.getSubmission);
router.patch('/submissions/:submissionId/grade', controller.gradeSubmission);

module.exports = router;

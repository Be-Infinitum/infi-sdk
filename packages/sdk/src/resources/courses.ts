import type { Transport } from "../http.js";
import type { KeyAccess } from "./access.js";

const enc = encodeURIComponent;

export type VideoProvider = "youtube" | "vimeo" | "panda" | "bunny" | "other";

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  position: number;
  video?: { url: string; provider: VideoProvider };
  bodyMarkdown?: string;
  unlockAfterDays: number;
  published: boolean;
  updatedAt: string;
}

export interface CourseModule {
  id: string;
  title: string;
  position: number;
  lessons: Lesson[];
}

export interface Course {
  id: string;
  accessKey: string;
  title: string;
  description?: string;
  coverUrl?: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  modules: CourseModule[];
}

export interface CourseInput {
  title?: string;
  /** The access key that opens the course. Required to create. */
  accessKey?: string;
  description?: string;
  coverUrl?: string;
  published?: boolean;
}

export interface LessonInput {
  /** Required to create; moves the lesson on update. */
  moduleId?: string;
  title?: string;
  /** An https link on your own provider (Vimeo, Panda, Bunny, YouTube). "" removes it. */
  videoUrl?: string;
  /** "" removes it. */
  bodyMarkdown?: string;
  /** Drip: available this many days after the student's access started. */
  unlockAfterDays?: number;
  published?: boolean;
}

/** A course as one of your customers sees it. */
export interface StudentCourse {
  id: string;
  title: string;
  access: KeyAccess;
  progress: { completed: number; total: number; percent: number };
  continue?: { lessonId: string; moduleId: string; title: string };
  modules?: {
    id: string;
    title: string;
    lessons: { id: string; title: string; state: "available" | "locked" | "no_access"; unlocksAt?: string; completed: boolean }[];
  }[];
}

/**
 * Courses — a small CMS for the course's structure (modules, lessons, the
 * video link on YOUR provider, markdown, drip). Infi never hosts the video.
 * The dashboard, the CLI and the MCP call these same routes. Server-side, `sk_`.
 */
export class CoursesResource {
  constructor(private readonly t: Transport) {}

  async list(): Promise<Course[]> {
    return (await this.t.request<{ courses: Course[] }>("GET", "/courses", { requireSecret: true })).courses;
  }

  get(courseId: string): Promise<Course> {
    return this.t.request("GET", `/courses/${enc(courseId)}`, { requireSecret: true });
  }

  create(input: CourseInput & { title: string; accessKey: string }, idempotencyKey?: string): Promise<Course> {
    return this.t.request("POST", "/courses", { body: input, requireSecret: true, idempotencyKey });
  }

  update(courseId: string, input: CourseInput, idempotencyKey?: string): Promise<Course> {
    return this.t.request("PATCH", `/courses/${enc(courseId)}`, { body: input, requireSecret: true, idempotencyKey });
  }

  delete(courseId: string, idempotencyKey?: string): Promise<void> {
    return this.t.request("DELETE", `/courses/${enc(courseId)}`, { requireSecret: true, idempotencyKey });
  }

  createModule(courseId: string, title: string, idempotencyKey?: string): Promise<CourseModule> {
    return this.t.request("POST", `/courses/${enc(courseId)}/modules`, { body: { title }, requireSecret: true, idempotencyKey });
  }

  renameModule(courseId: string, moduleId: string, title: string, idempotencyKey?: string): Promise<CourseModule> {
    return this.t.request("PATCH", `/courses/${enc(courseId)}/modules/${enc(moduleId)}`, {
      body: { title },
      requireSecret: true,
      idempotencyKey,
    });
  }

  deleteModule(courseId: string, moduleId: string, idempotencyKey?: string): Promise<void> {
    return this.t.request("DELETE", `/courses/${enc(courseId)}/modules/${enc(moduleId)}`, { requireSecret: true, idempotencyKey });
  }

  /** Every module id, once, in the new order. */
  reorderModules(courseId: string, ids: string[], idempotencyKey?: string): Promise<Course> {
    return this.t.request("PUT", `/courses/${enc(courseId)}/modules/order`, { body: { ids }, requireSecret: true, idempotencyKey });
  }

  /** Every lesson id of the module, once, in the new order. */
  reorderLessons(courseId: string, moduleId: string, ids: string[], idempotencyKey?: string): Promise<Course> {
    return this.t.request("PUT", `/courses/${enc(courseId)}/modules/${enc(moduleId)}/lessons/order`, {
      body: { ids },
      requireSecret: true,
      idempotencyKey,
    });
  }

  createLesson(courseId: string, input: LessonInput & { moduleId: string; title: string }, idempotencyKey?: string): Promise<Lesson> {
    return this.t.request("POST", `/courses/${enc(courseId)}/lessons`, { body: input, requireSecret: true, idempotencyKey });
  }

  getLesson(courseId: string, lessonId: string): Promise<Lesson> {
    return this.t.request("GET", `/courses/${enc(courseId)}/lessons/${enc(lessonId)}`, { requireSecret: true });
  }

  updateLesson(courseId: string, lessonId: string, input: LessonInput, idempotencyKey?: string): Promise<Lesson> {
    return this.t.request("PATCH", `/courses/${enc(courseId)}/lessons/${enc(lessonId)}`, {
      body: input,
      requireSecret: true,
      idempotencyKey,
    });
  }

  /** Deletes the lesson and everyone's progress on it. */
  deleteLesson(courseId: string, lessonId: string, idempotencyKey?: string): Promise<void> {
    return this.t.request("DELETE", `/courses/${enc(courseId)}/lessons/${enc(lessonId)}`, { requireSecret: true, idempotencyKey });
  }

  /** The course as one of your customers sees it: access, drip, progress, where they continue. */
  student(courseId: string, externalId: string): Promise<StudentCourse> {
    return this.t.request("GET", `/courses/${enc(courseId)}/students/${enc(externalId)}`, { requireSecret: true });
  }
}

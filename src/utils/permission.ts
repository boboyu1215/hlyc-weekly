// 权限中枢，所有判断走此处
import { DIRECTORS } from '@/config/constants'

export type Role = 'admin' | 'member'
export type Title = '总监' | '研策负责人' | '筹备负责人' | '普通成员'

// 判断是否管理员
export function isAdmin(user: string, users: Record<string, any>): boolean {
  if (DIRECTORS.includes(user)) return true
  return users[user]?.role === 'admin'
}

// 判断是否项目负责人（designOwner 或 prepOwner）
export function isProjectOwner(user: string, project: any): boolean {
  return project?.designOwner === user || project?.prepOwner === user
}

// 统一权限判断入口
export function can(
  action: 'edit' | 'submit' | 'comment' | 'archive' | 'delete' | 'create' | 'manage',
  user: string,
  users: Record<string, any>,
  project?: any
): boolean {
  const admin = isAdmin(user, users)
  const owner = project ? isProjectOwner(user, project) : false

  switch (action) {
    case 'edit':    return admin || owner
    case 'submit':  return admin || owner
    case 'comment': return admin
    case 'archive': return admin
    case 'delete':  return admin
    case 'create':  return admin
    case 'manage':  return admin
    default:        return false
  }
}

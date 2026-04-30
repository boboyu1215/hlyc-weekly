// 权限中枢，所有判断走此处
import type { User } from '@/core/types'

export type Role = 'admin' | 'member' | 'guest'
export type Title = '总监' | '研策负责人' | '筹备负责人' | '普通成员'

// 判断是否管理员
export function isAdmin(user: string, users: Record<string, any>): boolean {
  return users[user]?.role === 'admin'
}

// 判断是否项目负责人（designOwner 或 prepOwner）
export function isProjectOwner(user: string, project: any): boolean {
  return project?.designOwner === user || project?.prepOwner === user
}

// 判断是否访客
export function isGuest(user: string, users: Record<string, any>): boolean {
  return users[user]?.role === 'guest'
}

// 向后兼容别名
export const isDirector = isAdmin

// 统一权限判断入口
export function can(
  action: 'edit' | 'submit' | 'comment' | 'archive' | 'delete' | 'create' | 'manage' | 'board',
  user: string,
  users: Record<string, any>,
  project?: any
): boolean {
  const admin = isAdmin(user, users)
  const member = !isGuest(user, users)
  const owner = project ? isProjectOwner(user, project) : false

  switch (action) {
    case 'edit':    return admin || owner
    case 'submit':  return admin || owner
    case 'comment': return admin
    case 'archive': return admin
    case 'delete':  return admin
    case 'create':  return admin
    case 'manage':  return admin
    case 'board':   return admin || member  // 管理员+成员均可编辑黑板报
    default:        return false
  }
}

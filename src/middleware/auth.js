export function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ message: 'Your session has expired. Please login again.' })
  }
  return next()
}

export function requireAdmin(req, res, next) {
  if (!req.session?.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' })
  }
  return next()
}

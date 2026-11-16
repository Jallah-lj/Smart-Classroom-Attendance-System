import { Request, Response, NextFunction } from 'express';

export function requireRole(...allowedRoles: Array<'ADMIN' | 'LECTURER' | 'STUDENT'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required.'
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: `Access denied. Role "${req.user.role}" does not have permission to access this resource.`
      });
      return;
    }

    next();
  };
}

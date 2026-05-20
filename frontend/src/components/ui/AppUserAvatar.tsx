import { useState } from 'react';
import { withFileAccessToken } from '@/lib/api';
import { getUserInitials, getUserPhotoFileId, type UserDisplaySource } from '@/lib/userDisplay';
import { uiCx, uiUserSelect } from './tokens';

type AppUserAvatarProps = {
  user: UserDisplaySource | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
};

export function AppUserAvatar({ user, size = 'sm', className }: AppUserAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const photoId = getUserPhotoFileId(user);
  const initials = getUserInitials(user);
  const sizeClass = size === 'md' ? uiUserSelect.avatarMd : uiUserSelect.avatarSm;

  if (photoId && !imageError) {
    return (
      <img
        src={withFileAccessToken(`/files/${photoId}/thumbnail?w=64`)}
        alt=""
        className={uiCx(sizeClass, className)}
        onError={() => setImageError(true)}
      />
    );
  }

  return (
    <span className={uiCx(uiUserSelect.avatarPlaceholder, sizeClass, className)} aria-hidden>
      {initials}
    </span>
  );
}

import api from '@/lib/axios';
import Cookies from 'js-cookie';

interface RegisterPayload {
  email: string;
  password: string;
  title: string;
  fullName: string;
}

interface LoginPayload {
  email: string;
  password: string;
}

interface KidsPayload {
  name: string;
  ageRange: string;
  avatar: string;
}

const setTokens = (jwt: string, refreshToken: string) => {
  Cookies.set('accessToken', jwt, { expires: 1 / 24 });
  Cookies.set('refreshToken', refreshToken, { expires: 7 });
};

export const registerService = async (payload: RegisterPayload) => {
  try {
    const response = await api.post('/auth/register', payload);
    const { jwt, refreshToken } = response.data;
    setTokens(jwt, refreshToken);
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Registration failed',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }

    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const loginService = async (payload: LoginPayload) => {
  try {
    const response = await api.post('/auth/login', payload);
    const { jwt, refreshToken } = response.data;
    setTokens(jwt, refreshToken);
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Login failed',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const verifyEmailService = async (token: string) => {
  try {
    const response = await api.post(`/auth/verify-email?token=${token}`);
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Verification failed',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const sendVerificationEmailService = async (email: string) => {
  try {
    const response = await api.post(`/auth/send-verification?email=${email}`);
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  } catch (error: any) {
    if (error.response) {
      throw {
        message:
          error.response.data?.message || 'Failed to send verification email',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const requestPasswordResetService = async (email: string) => {
  try {
    const response = await api.post(
      `/auth/request-password-reset?email=${encodeURIComponent(email)}`
    );
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message:
          error.response.data?.message || 'Failed to request password reset',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const validateResetTokenService = async ({
  token,
  email,
}: {
  token: string;
  email: string;
}) => {
  try {
    const response = await api.get(
      `/auth/validate-reset-token?token=${encodeURIComponent(
        token
      )}&email=${encodeURIComponent(email)}`
    );
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message:
          error.response.data?.message || 'Reset token validation failed',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const resetPasswordService = async ({
  token,
  newPassword,
}: {
  token: string;
  newPassword: string;
}) => {
  try {
    const response = await api.post(
      `/auth/reset-password?token=${encodeURIComponent(
        token
      )}&newPassword=${encodeURIComponent(newPassword)}`
    );
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: external error shape
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Failed to reset password',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

export const addKidsService = async (kids: KidsPayload[]) => {
  try {
    const response = await api.post('/auth/kids', kids);
    return response.data;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  } catch (error: any) {
    if (error.response) {
      throw {
        message: error.response.data?.message || 'Failed to add kids',
        status: error.response.status,
        data: error.response.data,
      };
    }
    if (error.request) {
      throw { message: 'No response from server', status: null };
    }
    throw { message: error.message || 'Unexpected error', status: null };
  }
};

import { Resend } from 'resend';
import { env } from '../config/env';

const resend = new Resend(env.RESEND_API_KEY);

export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
): Promise<void> => {
  try {
    const result = await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
    });
    if (result.error) {
      console.error('[email] send failed:', result.error);
    }
  } catch (err) {
    console.error('[email] send threw:', err);
  }
};

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const sendVerificationEmail = async (
  to: string,
  fullName: string,
  token: string,
): Promise<void> => {
  const link = `${env.APP_URL}/auth/verify-email?token=${encodeURIComponent(token)}`;
  const name = escapeHtml(fullName);
  const html = `
    <p>Xin chào ${name},</p>
    <p>Vui lòng nhấn vào liên kết dưới đây để xác minh email của bạn:</p>
    <p><a href="${link}">${link}</a></p>
    <p>Liên kết có hiệu lực trong 24 giờ.</p>
    <p>Nếu bạn không tạo tài khoản NutriCoach, vui lòng bỏ qua email này.</p>
  `.trim();
  await sendEmail(to, 'Xác minh email NutriCoach', html);
};

export const sendPasswordResetEmail = async (
  to: string,
  fullName: string,
  token: string,
): Promise<void> => {
  const link = `${env.APP_URL}/auth/reset-password?token=${encodeURIComponent(token)}`;
  const name = escapeHtml(fullName);
  const html = `
    <p>Xin chào ${name},</p>
    <p>Bạn đã yêu cầu đặt lại mật khẩu. Nhấn vào liên kết dưới đây để đặt mật khẩu mới:</p>
    <p><a href="${link}">${link}</a></p>
    <p>Liên kết có hiệu lực trong 15 phút.</p>
    <p>Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>
  `.trim();
  await sendEmail(to, 'Đặt lại mật khẩu NutriCoach', html);
};

export const sendVerificationApprovedEmail = async (
  to: string,
  fullName: string,
): Promise<void> => {
  const name = escapeHtml(fullName);
  const link = `${env.APP_URL}/pt/dashboard`;
  const html = `
    <p>Xin chào ${name},</p>
    <p>Hồ sơ Huấn luyện viên của bạn đã được duyệt — chào mừng đến với NutriCoach!</p>
    <p>Bạn có thể bắt đầu thiết lập hồ sơ và khóa học của mình tại đây:</p>
    <p><a href="${link}">${link}</a></p>
    <p>Chúc bạn thành công cùng NutriCoach.</p>
  `.trim();
  await sendEmail(
    to,
    'Hồ sơ HLV của bạn đã được duyệt — Chào mừng đến với NutriCoach!',
    html,
  );
};

export const sendVerificationRejectedEmail = async (
  to: string,
  fullName: string,
  reason: string,
  canResubmit: boolean,
): Promise<void> => {
  const name = escapeHtml(fullName);
  const reasonHtml = escapeHtml(reason);
  const nextStep = canResubmit
    ? '<p>Bạn có thể nộp lại hồ sơ sau khi bổ sung các thông tin cần thiết.</p>'
    : '<p>Vui lòng liên hệ đội ngũ hỗ trợ NutriCoach để biết thêm chi tiết.</p>';
  const html = `
    <p>Xin chào ${name},</p>
    <p>Hồ sơ Huấn luyện viên của bạn cần được bổ sung trước khi có thể được duyệt.</p>
    <p><strong>Lý do:</strong> ${reasonHtml}</p>
    ${nextStep}
  `.trim();
  await sendEmail(to, 'Hồ sơ HLV của bạn cần được bổ sung', html);
};

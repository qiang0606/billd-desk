import { IDeskUser } from '@/types/IUser';
import request from '@/utils/request';
import {
  isOfficialService,
  officialRequest,
} from '@/utils/network/officialApi';

export function fetchFindReceiverByUuid(uuid) {
  return request.get(`/desk_user/find_receiver_by_uuid`, { params: { uuid } });
}

export function fetchDeskUserLogin(data: IDeskUser) {
  if (isOfficialService())
    return officialRequest('/desk_user/login', {
      uuid: data.uuid,
      password: data.password,
    }).then((res) => ({ ...res, data: res.data.desk_user }));
  return request.post<IDeskUser>(`/desk_user/login`, data);
}

export function fetchDeskUserLinkVerify(data: IDeskUser) {
  return request.post(`/desk_user/link_verify`, data);
}

export function fetchDeskUserCreate() {
  if (isOfficialService()) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0];
    return officialRequest('/desk_user/auto_register', {
      uuid: String(100000000 + (random % 900000000)),
      pcname: 'BilldDesk OpenSource ARM64',
    }).then((res) => ({ ...res, data: res.data.desk_user }));
  }
  return request.post<IDeskUser>(`/desk_user/create`);
}

export function fetchDeskUserUpdateByUuid(data: IDeskUser) {
  return request.put<IDeskUser>(`/desk_user/update_by_uuid`, data);
}

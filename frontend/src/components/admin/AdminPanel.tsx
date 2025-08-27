import { useEffect, useState } from "react";
import { adminAddMachine, adminAuthorize, adminGetMachines, adminLanHosts, adminSetApproved } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export function AdminPanel() {
  const { adminToken, loading, error, login, logout } = useAdminAuth();
  const [password, setPassword] = useState("");
  const [machines, setMachines] = useState<Array<{ id?: number; ip_address: string; user?: { id: number; username: string }; approved?: boolean }>>([]);
  const [lanHosts, setLanHosts] = useState<string[]>([]);
  const [newUsername, setNewUsername] = useState<string>("");
  const [showAdd, setShowAdd] = useState(false)
  const [addIp, setAddIp] = useState("")
  const [addIsAdmin, setAddIsAdmin] = useState(false)
  const [addUsername, setAddUsername] = useState("")
  const [addError, setAddError] = useState<string>("")

  useEffect(() => {
    if (!adminToken) return;
    (async () => {
      try {
        const list = await adminGetMachines(adminToken);
        setMachines(list);
      } catch {}
    })();
  }, [adminToken]);

  if (!adminToken) {
    return (
      <div className="max-w-md mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>פאנל אדמין</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">כניסה מאובטחת: נדרשת סיסמה ומחשב מנהל מורשה.</div>
            {error && <div className="text-sm text-destructive">שגיאה: {error}</div>}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await login(password);
              }}
              className="flex gap-2 items-center"
            >
              <Input
                type="password"
                placeholder="סיסמת אדמין"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button type="submit" disabled={loading}>כניסה</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>מחשבים מורשים</CardTitle>
            <Button variant="ghost" onClick={logout}>יציאה</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-2 items-center">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const ips = await adminLanHosts()
                  setLanHosts(ips)
                } catch {}
              }}
            >סריקת רשת</Button>
            {lanHosts.length > 0 && (
              <span className="text-sm text-muted-foreground">נמצאו {lanHosts.length} כתובות</span>
            )}
            <div className="ml-auto">
              <Button onClick={() => setShowAdd(true)}>הוסף מכונה</Button>
            </div>
          </div>

          {showAdd && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50" onClick={() => setShowAdd(false)} />
              <div className="relative bg-white rounded-lg shadow w-full max-w-md p-4">
                <div className="mb-3 text-lg font-semibold">הוספת מכונה</div>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm block mb-1">כתובת IP</label>
                    <Input placeholder="לדוגמה: 192.168.2.50" value={addIp} onChange={(e) => setAddIp(e.target.value)} />
                    <div className="mt-1 text-xs text-muted-foreground">יש להוסיף כתובת בטווח 192.168.2.X בלבד</div>
                    {addError && <div className="mt-1 text-xs text-destructive">{addError}</div>}
                  </div>
                  <div>
                    <label className="text-sm block mb-1">שם משתמש לשיוך (אופציונלי)</label>
                    <Input placeholder="לדוגמה: user1" value={addUsername} onChange={(e) => setAddUsername(e.target.value)} />
                  </div>
                  <label className="text-sm flex items-center gap-2">
                    <input type="checkbox" checked={addIsAdmin} onChange={(e) => setAddIsAdmin(e.target.checked)} /> מנהל מערכת
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" onClick={() => setShowAdd(false)}>ביטול</Button>
                    <Button
                      onClick={async () => {
                        if (!adminToken) return
                        const ip = addIp.trim()
                        // Client-side validation: 192.168.2.X
                        const ipOk = /^192\.168\.2\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-4])$/.test(ip)
                        if (!ipOk) { setAddError('נא להזין IP בטווח 192.168.2.X'); return }
                        try {
                          await adminAddMachine(ip, addIsAdmin, adminToken, addUsername || undefined)
                          setMachines(prev => [...prev, { ip_address: ip, approved: false, user: addUsername ? { id: 0, username: addUsername } as any : undefined, is_admin: addIsAdmin }])
                          setShowAdd(false)
                          setAddIp("")
                          setAddIsAdmin(false)
                          setAddUsername("")
                          setAddError("")
                        } catch {}
                      }}
                    >הוסף</Button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {lanHosts.length > 0 && (
            <div className="mb-6">
              <Card>
                <CardHeader>
                  <CardTitle>מחשבים שנמצאו ברשת</CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-right text-muted-foreground">
                        <th className="py-2">IP</th>
                        <th className="py-2">סטטוס</th>
                        <th className="py-2">שם משתמש לשיוך</th>
                        <th className="py-2">פעולה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lanHosts.map((ip) => {
                        const existing = machines.find((m) => m.ip_address === ip)
                        const authorized = Boolean(existing && existing.approved)
                        return (
                          <tr key={`lan-${ip}`} className="border-t">
                            <td className="py-2">{ip}</td>
                            <td className="py-2">{authorized ? 'מאושר' : 'לא מאושר'}</td>
                            <td className="py-2 w-64">
                              <Input placeholder="username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
                            </td>
                            <td className="py-2">
                              {!authorized ? (
                                <Button size="sm" onClick={async () => {
                                  if (!adminToken) return
                                  await adminAuthorize(ip, adminToken, newUsername || undefined)
                                  setMachines(prev => {
                                    const idx = prev.findIndex(x => x.ip_address === ip)
                                    if (idx >= 0) {
                                      const clone = [...prev]
                                      clone[idx] = { ...clone[idx], approved: true, user: newUsername ? { id: 0, username: newUsername } as any : clone[idx].user }
                                      return clone
                                    }
                                    return [...prev, { ip_address: ip, approved: true, user: newUsername ? { id: 0, username: newUsername } as any : undefined }]
                                  })
                                }}>אשר</Button>
                              ) : (
                                <Button size="sm" variant="secondary" onClick={async () => {
                                  if (!adminToken) return
                                  await adminSetApproved(ip, false, adminToken)
                                  setMachines(prev => prev.map(x => x.ip_address === ip ? { ...x, approved: false } : x))
                                }}>בטל</Button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-muted-foreground">
                  <th className="py-2">IP</th>
                  <th className="py-2">משויך ל</th>
                  <th className="py-2">סטטוס</th>
                  <th className="py-2">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {machines.map((m) => {
                  const owner = m.user?.username ?? '—'
                  return (
                    <tr key={`${m.ip_address}`} className="border-t">
                      <td className="py-2">{m.ip_address}</td>
                      <td className="py-2">{owner}</td>
                      <td className="py-2">{m.approved ? 'מאושר' : 'לא מאושר'}</td>
                      <td className="py-2">
                        <div className="flex gap-2">
                          {m.approved ? (
                            <Button size="sm" variant="outline" onClick={async () => {
                              if (!adminToken) return
                              await adminSetApproved(m.ip_address, false, adminToken)
                              setMachines(prev => prev.map(x => x.ip_address === m.ip_address ? { ...x, approved: false } : x))
                            }}>בטל אישור</Button>
                          ) : (
                            <Button size="sm" onClick={async () => {
                              if (!adminToken) return
                              await adminSetApproved(m.ip_address, true, adminToken)
                              setMachines(prev => prev.map(x => x.ip_address === m.ip_address ? { ...x, approved: true } : x))
                            }}>אשר</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}



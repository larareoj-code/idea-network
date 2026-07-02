import { describe, expect, it } from "vitest";
import { parseEml } from "../src/lib/parseEml";

const SIMPLE_EML = `From: "Thomas, Walter D LTC USARMY" <walter.d.thomas.mil@army.mil>\r
To: "Larareo, Josef A CW2 USARMY" <josef.a.larareo.mil@army.mil>, ops@example.com\r
Cc: Charles Barrier <charles.barrier@army.mil>\r
Subject: Promotion\r
Date: Mon, 29 Jun 2026 22:08:08 -1000\r
Content-Type: text/plain; charset=utf-8\r
\r
Joe,\r
\r
Just wanted to check and see if you needed anything for your promotion.\r
`;

const QP_EML = `From: sender@example.com\r
Subject: =?utf-8?Q?Phase_maintenance_=E2=80=94_update?=\r
Content-Type: text/plain; charset=utf-8\r
Content-Transfer-Encoding: quoted-printable\r
\r
Swashplate replacement =E2=80=94 done.\r
`;

const MULTIPART_EML = `From: a@example.com\r
To: b@example.com\r
Subject: Multipart test\r
Content-Type: multipart/alternative; boundary="XYZ"\r
\r
--XYZ\r
Content-Type: text/html\r
\r
<p>HTML body</p>\r
--XYZ\r
Content-Type: text/plain\r
\r
Plain body wins.\r
--XYZ--\r
`;

describe("parseEml", () => {
  it("parses headers, recipients, body, and date", () => {
    const [msg] = parseEml(SIMPLE_EML, "test.eml");
    expect(msg.subject).toBe("Promotion");
    expect(msg.from?.key).toBe("walter.d.thomas.mil@army.mil");
    expect(msg.from?.displayName).toBe("Walter Thomas");
    expect(msg.to.length).toBe(2);
    expect(msg.to[1].key).toBe("ops@example.com");
    expect(msg.cc.length).toBe(1);
    expect(msg.body).toContain("needed anything for your promotion");
    expect(msg.date).toBeDefined();
    expect(new Date(msg.date!).getUTCFullYear()).toBe(2026);
  });

  it("decodes quoted-printable bodies and RFC2047 subjects", () => {
    const [msg] = parseEml(QP_EML, "qp.eml");
    expect(msg.subject).toBe("Phase maintenance — update");
    expect(msg.body).toContain("Swashplate replacement — done.");
  });

  it("prefers text/plain in multipart messages", () => {
    const [msg] = parseEml(MULTIPART_EML, "mp.eml");
    expect(msg.body.trim()).toBe("Plain body wins.");
  });

  it("returns empty for non-mail text", () => {
    expect(parseEml("just some text\n\nwith no headers", "junk.eml")).toEqual([]);
  });
});

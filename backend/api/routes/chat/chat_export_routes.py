"""Export routes for downloading chat conversations."""
from infra.logging_utils import get_logger
import asyncio
import csv
from datetime import datetime
from io import BytesIO
from zoneinfo import ZoneInfo
from fastapi import APIRouter, HTTPException, Query, Request, Depends
from fastapi.responses import Response

from auth.permissions import require_view_debug
from domain.user import User

logger = get_logger(__name__)
router = APIRouter()


def _normalize_messages_for_export(messages):
    """Normaliza documentos de messages para exportacion.

    - Elimina `_id`, crea columna `Fecha y Hora` (Lima), ordena reciente->antiguo.
    """
    import pandas as pd

    df = pd.json_normalize(messages, sep='__')
    if '_id' in df.columns:
        df = df.drop(columns=['_id'])
    if 'timestamp' in df.columns:
        ts = pd.to_datetime(df['timestamp'], errors='coerce', utc=True)
        ts_lima = ts.dt.tz_convert('America/Lima')
        df['Fecha y Hora'] = ts_lima.dt.strftime('%Y-%m-%d %H:%M:%S')
        df['Fecha y Hora'] = df['Fecha y Hora'].fillna('-')
        df['__ts'] = ts
        df = df.sort_values(['__ts'], ascending=False)
        df = df.drop(columns=['__ts', 'timestamp'])
    else:
        df['Fecha y Hora'] = '-'
        df = df.sort_values(['Fecha y Hora'], ascending=False)
    if 'conversation_id' in df.columns:
        df = df.rename(columns={'conversation_id': 'ID Conversacion'})
    if 'role' in df.columns:
        df = df.rename(columns={'role': 'Rol'})
    if 'content' in df.columns:
        df = df.rename(columns={'content': 'Mensaje'})
    if 'source' in df.columns:
        df = df.rename(columns={'source': 'Fuente'})
    base_cols = [c for c in ['ID Conversacion', 'Fecha y Hora', 'Rol', 'Mensaje', 'Fuente'] if c in df.columns]
    extras = [c for c in df.columns if c not in base_cols]
    df = df[base_cols + sorted(extras)]
    return df


def _process_export(messages, format: str, current_time: str) -> tuple[bytes, str, str]:
    """Procesa la exportacion en un hilo separado para no bloquear el event loop."""
    import pandas as pd
    import json as pyjson

    if format.lower() == 'xlsx':
        output = BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            if not messages:
                df = pd.DataFrame(columns=['ID Conversacion', 'Fecha y Hora', 'Rol', 'Mensaje'])
                lima_now = datetime.now(ZoneInfo("America/Lima")).strftime('%Y-%m-%d %H:%M:%S')
                df.loc[0] = ["-", lima_now, "info", "Sin conversaciones registradas"]
                df.to_excel(writer, sheet_name='Conversaciones', index=False)
            else:
                df = _normalize_messages_for_export(messages)
                df.to_excel(writer, sheet_name='Conversaciones', index=False)

                workbook = writer.book
                worksheet = writer.sheets['Conversaciones']

                header_format = workbook.add_format({'bold': True, 'bg_color': '#D9E1F2', 'border': 1})
                conversation_format = workbook.add_format({'bg_color': '#E2EFDA', 'border': 1})
                cell_format = workbook.add_format({'border': 1, 'text_wrap': True})

                for col_num, value in enumerate(df.columns.values):
                    worksheet.write(0, col_num, value, header_format)

                current_conversation = None
                id_idx = df.columns.get_loc('ID Conversacion') if 'ID Conversacion' in df.columns else None
                for row_num, row in enumerate(df.itertuples(index=False), start=1):
                    conv = row[id_idx] if id_idx is not None else None
                    if conv != current_conversation:
                        current_conversation = conv
                        if conv is not None and id_idx is not None:
                            worksheet.write(row_num, id_idx, conv, conversation_format)
                    for col_idx in range(len(df.columns)):
                        if id_idx is not None and col_idx == id_idx and conv is not None:
                            continue
                        worksheet.write(row_num, col_idx, row[col_idx], cell_format)

                if 'ID Conversacion' in df.columns:
                    worksheet.set_column(id_idx, id_idx, 36)
                if 'Fecha y Hora' in df.columns:
                    ts_idx = df.columns.get_loc('Fecha y Hora')
                    worksheet.set_column(ts_idx, ts_idx, 20)
                if 'Rol' in df.columns:
                    r_idx = df.columns.get_loc('Rol')
                    worksheet.set_column(r_idx, r_idx, 10)
                if 'Mensaje' in df.columns:
                    m_idx = df.columns.get_loc('Mensaje')
                    worksheet.set_column(m_idx, m_idx, 100)

                worksheet.autofilter(0, 0, len(df), len(df.columns) - 1)
                worksheet.freeze_panes(1, 0)

        output.seek(0)
        filename = f'conversaciones_{current_time}.xlsx'
        content = output.getvalue()
        media_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        return content, media_type, filename

    elif format.lower() == 'csv':
        if not messages:
            df = pd.DataFrame(columns=['ID Conversacion', 'Fecha y Hora', 'Rol', 'Mensaje'])
            lima_now = datetime.now(ZoneInfo("America/Lima")).strftime('%Y-%m-%d %H:%M:%S')
            df.loc[0] = ["-", lima_now, "info", "Sin conversaciones registradas"]
        else:
            df = _normalize_messages_for_export(messages)
        csv_str = df.to_csv(index=False, sep=';', quoting=csv.QUOTE_ALL)
        csv_bytes = ('﻿' + csv_str).encode('utf-8')
        filename = f'conversaciones_{current_time}.csv'
        media_type = 'text/csv; charset=utf-8'
        return csv_bytes, media_type, filename

    elif format.lower() == 'json':
        if not messages:
            data = []
        else:
            df = _normalize_messages_for_export(messages)
            data = [dict(row) for row in df.to_dict(orient='records')]
        json_str = pyjson.dumps(data, ensure_ascii=False, indent=2)
        filename = f'conversaciones_{current_time}.json'
        media_type = 'application/json; charset=utf-8'
        return json_str.encode('utf-8'), media_type, filename

    else:
        raise ValueError("Formato de exportacion no soportado: use xlsx, csv o json")


@router.get("/export-conversations")
async def export_conversations(
    request: Request,
    format: str = 'xlsx',
    sep: str = 'comma',
    pretty: bool = False,
    limit: int = Query(default=10_000, ge=1, le=50_000),
    _: User = Depends(require_view_debug),
):
    """Exporta conversaciones en XLSX (por defecto), CSV o JSON."""
    try:
        chat_manager = request.app.state.chat_manager
        db = chat_manager.db

        logger.warning("[export] Fetching up to %d messages", limit)
        cursor = db.messages.find({}).sort([("conversation_id", 1), ("timestamp", 1)])
        messages = await cursor.to_list(length=limit)

        current_time = datetime.now(ZoneInfo("America/Lima")).strftime('%Y%m%d_%H%M%S')

        try:
            content, media_type, filename = await asyncio.to_thread(
                _process_export, messages, format, current_time
            )
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))

        headers = {'Content-Disposition': f'attachment; filename="{filename}"'}
        return Response(content=content, media_type=media_type, headers=headers)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al exportar conversaciones: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error al exportar conversaciones: {str(e)}")
